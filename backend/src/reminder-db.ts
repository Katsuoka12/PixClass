import { createHash } from 'node:crypto';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { DueReminder, ReminderLease, ReminderStore } from './reminders.js';

type ReminderRow = RowDataPacket & Omit<DueReminder, 'due_at'> & { due_at: Date };

export function createReminderStore(pool: Pool): ReminderStore {
  return {
    async acquire() {
      const connection = await pool.getConnection();
      let lockName: string;
      try {
        const [database] = await connection.execute<(RowDataPacket & { name: string | null })[]>('SELECT DATABASE() AS name');
        if (!database[0]?.name) throw new Error('Reminder database is not selected');
        lockName = `student-tag:due:${createHash('sha256').update(database[0].name).digest('hex').slice(0, 48)}`;
        const [result] = await connection.execute<RowDataPacket[]>('SELECT GET_LOCK(?, ?) AS acquired', [lockName, 0]);
        if (result[0]?.acquired === 0) { connection.release(); return null; }
        if (result[0]?.acquired !== 1) throw new Error('Reminder lock acquisition failed');
      } catch (error) { connection.destroy(); throw error; }
      return createLease(connection, lockName);
    },
  };
}

function createLease(connection: PoolConnection, lockName: string): ReminderLease {
  let closed = false;
  const reservations = new Map<number, DueReminder>();
  function destroy() {
    closed = true;
    connection.destroy();
  }
  async function ownsLock(): Promise<boolean> {
    if (closed) return false;
    try {
      const [rows] = await connection.execute<RowDataPacket[]>('SELECT IS_USED_LOCK(?) = CONNECTION_ID() AS owned', [lockName]);
      if (rows[0]?.owned === 1) return true;
    } catch { /* A disconnected lease must never reconnect and continue sending. */ }
    destroy();
    return false;
  }
  async function requireLock() {
    if (!await ownsLock()) throw new Error('Reminder lease is no longer active');
  }
  function itemValues(item: DueReminder) {
    return [item.user_id, item.class_id, item.assignment_id, new Date(item.due_at), item.window, item.window];
  }
  const validItem = (item: DueReminder) => ['24h', '3h'].includes(item.window) && Number.isFinite(Date.parse(item.due_at));
  return {
    async candidates() {
      await requireLock();
      const [rows] = await connection.execute<ReminderRow[]>(
        `SELECT a.id AS assignment_id, c.id AS class_id, c.name AS class_name, a.title, a.due_at, u.id AS user_id,
          CASE WHEN a.due_at <= UTC_TIMESTAMP() + INTERVAL 3 HOUR THEN '3h' ELSE '24h' END AS \`window\`
         FROM assignments a JOIN classes c ON c.id = a.class_id
         JOIN class_members cm ON cm.class_id = c.id JOIN users u ON u.id = cm.user_id
         LEFT JOIN submissions s ON s.assignment_id = a.id AND s.student_id = u.id
         WHERE a.due_at > UTC_TIMESTAMP() AND a.due_at <= UTC_TIMESTAMP() + INTERVAL 24 HOUR
           AND c.archived = ? AND u.role = ? AND u.is_active = ? AND s.id IS NULL
           AND NOT EXISTS (SELECT 1 FROM notification_log n WHERE n.user_id = u.id AND n.ref_id = a.id
             AND n.kind = CASE WHEN a.due_at <= UTC_TIMESTAMP() + INTERVAL 3 HOUR THEN 'due_3h' ELSE 'due_24h' END)
         ORDER BY a.due_at, a.id, u.id`, [0, 'student', 1],
      );
      return rows.map(row => ({ assignment_id: row.assignment_id, class_id: row.class_id, class_name: row.class_name, title: row.title, due_at: row.due_at.toISOString(), user_id: row.user_id, window: row.window }));
    },
    async claim(item) {
      await requireLock();
      if (!validItem(item)) return null;
      const kind = `due_${item.window}`;
      // The dedicated advisory lock serializes processes; this statement also serializes calls on this lease.
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO notification_log (user_id, kind, ref_id, payload, status, error)
         SELECT u.id, ?, a.id, ?, ?, ? FROM users u
         JOIN class_members cm ON cm.user_id = u.id JOIN classes c ON c.id = cm.class_id
         JOIN assignments a ON a.class_id = c.id
         LEFT JOIN submissions s ON s.assignment_id = a.id AND s.student_id = u.id
         WHERE u.id = ? AND c.id = ? AND a.id = ? AND a.due_at = ?
           AND ((? = '24h' AND a.due_at > UTC_TIMESTAMP() + INTERVAL 3 HOUR AND a.due_at <= UTC_TIMESTAMP() + INTERVAL 24 HOUR)
             OR (? = '3h' AND a.due_at > UTC_TIMESTAMP() AND a.due_at <= UTC_TIMESTAMP() + INTERVAL 3 HOUR))
           AND u.role = 'student' AND u.is_active = 1 AND c.archived = 0 AND s.id IS NULL
           AND NOT EXISTS (SELECT 1 FROM notification_log n WHERE n.user_id = u.id AND n.ref_id = a.id AND n.kind = ?)`,
        [kind, 'Scheduled reminder reserved', 'skipped', 'DUE_RESERVED', ...itemValues(item), kind],
      );
      if (!result.affectedRows) return null;
      reservations.set(result.insertId, { ...item });
      return result.insertId;
    },
    async eligible(item) {
      if (!await ownsLock() || !validItem(item)) return false;
      const [rows] = await connection.execute<RowDataPacket[]>(
        `SELECT u.id FROM users u JOIN class_members cm ON cm.user_id = u.id JOIN classes c ON c.id = cm.class_id
         JOIN assignments a ON a.class_id = c.id
         LEFT JOIN submissions s ON s.assignment_id = a.id AND s.student_id = u.id
         WHERE u.id = ? AND c.id = ? AND a.id = ? AND a.due_at = ?
           AND ((? = '24h' AND a.due_at > UTC_TIMESTAMP() + INTERVAL 3 HOUR AND a.due_at <= UTC_TIMESTAMP() + INTERVAL 24 HOUR)
             OR (? = '3h' AND a.due_at > UTC_TIMESTAMP() AND a.due_at <= UTC_TIMESTAMP() + INTERVAL 3 HOUR))
           AND u.role = 'student' AND u.is_active = 1 AND c.archived = 0 AND s.id IS NULL`, itemValues(item),
      );
      return rows.length > 0;
    },
    async complete(logId, record) {
      await requireLock();
      const item = reservations.get(logId);
      if (!item || item.user_id !== record.userId || item.assignment_id !== record.refId || record.kind !== `due_${item.window}`) {
        throw new Error('Reminder reservation does not match result');
      }
      const error = record.error === null || /^[A-Z][A-Z0-9_]{0,99}$/.test(record.error) ? record.error : 'REMINDER_RESULT_ERROR';
      const [result] = await connection.execute<ResultSetHeader>(
        'UPDATE notification_log SET payload = ?, status = ?, error = ? WHERE id = ? AND user_id = ? AND kind = ? AND ref_id = ?',
        [record.text.slice(0, 3999), record.status, error, logId, record.userId, record.kind, record.refId],
      );
      if (!result.affectedRows) throw new Error('Reminder reservation no longer exists');
      reservations.delete(logId);
    },
    async release() {
      if (closed) return;
      closed = true;
      try {
        const [rows] = await connection.execute<RowDataPacket[]>('SELECT RELEASE_LOCK(?) AS released', [lockName]);
        if (rows[0]?.released === 1) connection.release();
        else connection.destroy();
      } catch { connection.destroy(); }
    },
  };
}
