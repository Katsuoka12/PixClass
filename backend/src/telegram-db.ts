import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { TelegramAccount, TelegramStore } from './telegram.js';
import { ApiError } from './middleware/errors.js';

type AccountRow = RowDataPacket & { id: number; role: TelegramAccount['role']; name: string; is_active: number; telegram_chat_id: number | null; telegram_muted: number };
const accountFields = 'SELECT id, role, name, is_active, telegram_chat_id, telegram_muted FROM users';
const mapAccount = (row: AccountRow): TelegramAccount => ({
  id: row.id, role: row.role, name: row.name, is_active: row.is_active,
  chat_id: row.telegram_chat_id, muted: Boolean(row.telegram_muted),
});
const invalidLink = () => new ApiError(400, 'INVALID_LINK', 'ลิงก์เชื่อม Telegram ไม่ถูกต้องหรือหมดอายุ กรุณาสร้างลิงก์ใหม่');
const alreadyLinked = () => new ApiError(409, 'TELEGRAM_ALREADY_LINKED', 'บัญชีนี้หรือ Telegram นี้เชื่อมกับบัญชีอื่นอยู่แล้ว');

export function createTelegramStore(pool: Pool): TelegramStore {
  async function transaction<T>(action: (connection: PoolConnection) => Promise<T>): Promise<T> {
    const connection = await pool.getConnection();
    try {
      await connection.execute('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
      await connection.beginTransaction();
      const result = await action(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally { connection.release(); }
  }
  return {
    async account(userId) {
      const [rows] = await pool.execute<AccountRow[]>(`${accountFields} WHERE id = ?`, [userId]);
      return rows[0] ? mapAccount(rows[0]) : null;
    },
    async byChat(chatId) {
      const [rows] = await pool.execute<AccountRow[]>(`${accountFields} WHERE telegram_chat_id = ? AND is_active = ?`, [chatId, 1]);
      return rows[0] ? mapAccount(rows[0]) : null;
    },
    async issueLink(userId, token) {
      if (!/^[a-f0-9]{32}$/.test(token)) throw invalidLink();
      return transaction(async connection => {
        const [users] = await connection.execute<AccountRow[]>(`${accountFields} WHERE id = ? FOR UPDATE`, [userId]);
        if (!users[0]?.is_active) throw invalidLink();
        await connection.execute('UPDATE telegram_link_tokens SET used_at = UTC_TIMESTAMP() WHERE user_id = ? AND used_at IS NULL', [userId]);
        await connection.execute('INSERT INTO telegram_link_tokens (user_id, token, expires_at) VALUES (?, ?, UTC_TIMESTAMP() + INTERVAL 15 MINUTE)', [userId, token]);
        const [rows] = await connection.execute<(RowDataPacket & { expires_at: Date })[]>('SELECT expires_at FROM telegram_link_tokens WHERE token = ?', [token]);
        return rows[0]!.expires_at.toISOString();
      });
    },
    async link(token, chatId) {
      if (!/^[a-f0-9]{32}$/.test(token) || !Number.isSafeInteger(chatId) || chatId <= 0) throw invalidLink();
      try {
        await transaction(async connection => {
          const [discovered] = await connection.execute<(RowDataPacket & { user_id: number })[]>('SELECT user_id FROM telegram_link_tokens WHERE token = ?', [token]);
          if (!discovered[0]) throw invalidLink();
          // Match issueLink's user-first order so rotation and consumption cannot deadlock.
          const [users] = await connection.execute<AccountRow[]>(`${accountFields} WHERE id = ? FOR UPDATE`, [discovered[0].user_id]);
          const user = users[0];
          const [tokens] = await connection.execute<RowDataPacket[]>('SELECT id FROM telegram_link_tokens WHERE token = ? AND used_at IS NULL AND expires_at > UTC_TIMESTAMP() FOR UPDATE', [token]);
          if (!user?.is_active || !tokens[0]) throw invalidLink();
          if (user.telegram_chat_id !== null && user.telegram_chat_id !== chatId) throw alreadyLinked();
          await connection.execute('UPDATE users SET telegram_chat_id = ? WHERE id = ?', [chatId, user.id]);
          await connection.execute('UPDATE telegram_link_tokens SET used_at = UTC_TIMESTAMP() WHERE id = ?', [tokens[0].id]);
        });
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'ER_DUP_ENTRY') throw alreadyLinked();
        throw error;
      }
    },
    async mute(userId, muted) {
      await pool.execute('UPDATE users SET telegram_muted = ? WHERE id = ? AND is_active = ?', [muted ? 1 : 0, userId, 1]);
    },
    async log(record) {
      await pool.execute('INSERT INTO notification_log (user_id, kind, ref_id, payload, status, error) VALUES (?, ?, ?, ?, ?, ?)', [record.userId, record.kind, record.refId, record.text, record.status, record.error]);
    },
    async recipients(classId, assignmentId) {
      const [rows] = assignmentId === undefined
        ? await pool.execute<(RowDataPacket & { id: number })[]>(
          `SELECT u.id FROM users u JOIN class_members cm ON cm.user_id = u.id JOIN classes c ON c.id = cm.class_id
           WHERE c.id = ? AND c.archived = ? AND u.role = ? AND u.is_active = ? ORDER BY u.id`, [classId, 0, 'student', 1])
        : await pool.execute<(RowDataPacket & { id: number })[]>(
          `SELECT u.id FROM users u JOIN class_members cm ON cm.user_id = u.id JOIN classes c ON c.id = cm.class_id
           JOIN assignments a ON a.class_id = c.id LEFT JOIN submissions s ON s.assignment_id = a.id AND s.student_id = u.id
           WHERE c.id = ? AND a.id = ? AND c.archived = ? AND u.role = ? AND u.is_active = ? AND s.id IS NULL ORDER BY u.id`, [classId, assignmentId, 0, 'student', 1]);
      return rows.map(row => row.id);
    },
    async eligible(userId, classId, assignmentId) {
      const [rows] = assignmentId === undefined
        ? await pool.execute<RowDataPacket[]>(
          `SELECT u.id FROM users u JOIN class_members cm ON cm.user_id = u.id JOIN classes c ON c.id = cm.class_id
           WHERE u.id = ? AND c.id = ? AND c.archived = ? AND u.role = ? AND u.is_active = ?`, [userId, classId, 0, 'student', 1])
        : await pool.execute<RowDataPacket[]>(
          `SELECT u.id FROM users u JOIN class_members cm ON cm.user_id = u.id JOIN classes c ON c.id = cm.class_id
           JOIN assignments a ON a.class_id = c.id LEFT JOIN submissions s ON s.assignment_id = a.id AND s.student_id = u.id
           WHERE u.id = ? AND c.id = ? AND a.id = ? AND c.archived = ? AND u.role = ? AND u.is_active = ? AND s.id IS NULL`, [userId, classId, assignmentId, 0, 'student', 1]);
      return rows.length > 0;
    },
  };
}
