import { randomBytes } from 'node:crypto';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { LiveSession, LiveStore } from './live.js';
import type { User } from './types.js';
import { ApiError } from './middleware/errors.js';

type ClassRow = RowDataPacket & { id: number; teacher_id: number; archived: number };
type AccountRow = RowDataPacket & { id: number; role: User['role']; name: string; is_active: number };
type SessionRow = RowDataPacket & Omit<LiveSession, 'class_archived' | 'scheduled_at' | 'started_at' | 'ended_at'> & {
  class_archived: number; room_name: string; scheduled_at: Date | null; started_at: Date | null; ended_at: Date | null;
};
const fields = `SELECT s.*, c.name AS class_name, c.archived AS class_archived
  FROM live_sessions s JOIN classes c ON c.id=s.class_id`;
const mapSession = (row: SessionRow): LiveSession => ({
  id: row.id, class_id: row.class_id, class_name: row.class_name, class_archived: Boolean(row.class_archived),
  title: row.title, scheduled_at: row.scheduled_at?.toISOString() ?? null,
  started_at: row.started_at?.toISOString() ?? null, ended_at: row.ended_at?.toISOString() ?? null, created_by: row.created_by,
});
const forbidden = () => new ApiError(403, 'FORBIDDEN', 'คุณไม่มีสิทธิ์เข้าถึงคาบเรียนนี้');
const invalidToken = () => new ApiError(400, 'INVALID_LIVE_TOKEN', 'ลิงก์เข้าเรียนไม่ถูกต้องหรือหมดอายุ กรุณาขอลิงก์ใหม่จากหน้าห้องเรียน');
const missing = () => new ApiError(404, 'LIVE_NOT_FOUND', 'ไม่พบคาบเรียนนี้');

export function createLiveStore(pool: Pool): LiveStore {
  async function transaction<T>(action: (connection: PoolConnection) => Promise<T>): Promise<T> {
    const connection = await pool.getConnection();
    try {
      await connection.execute('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
      await connection.beginTransaction();
      const result = await action(connection);
      await connection.commit();
      return result;
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  }
  async function access(connection: PoolConnection, classId: number, user: User, teacherOnly = false, activeClass = false) {
    // Classroom first: same ordering as archive, member removal and assignment writes.
    const [classes] = await connection.execute<ClassRow[]>('SELECT id,teacher_id,archived FROM classes WHERE id=? FOR UPDATE', [classId]);
    const classroom = classes[0];
    if (!classroom) throw new ApiError(404, 'CLASS_NOT_FOUND', 'ไม่พบห้องเรียน');
    const [accounts] = await connection.execute<AccountRow[]>('SELECT id,role,name,is_active FROM users WHERE id=?', [user.id]);
    const account = accounts[0];
    if (!account?.is_active) throw new ApiError(401, 'UNAUTHENTICATED', 'กรุณาเข้าสู่ระบบอีกครั้ง');
    if (account.role === 'teacher') {
      if (classroom.teacher_id !== account.id) throw forbidden();
    } else if (account.role === 'student' && !teacherOnly) {
      const [members] = await connection.execute<RowDataPacket[]>('SELECT id FROM class_members WHERE class_id=? AND user_id=? FOR UPDATE', [classId, account.id]);
      if (!members.length) throw forbidden();
    } else throw forbidden();
    if (activeClass && classroom.archived) throw new ApiError(409, 'CLASS_ARCHIVED', 'ห้องเรียนนี้ถูกเก็บแล้ว');
    return account;
  }
  async function sessionAccess(connection: PoolConnection, id: number, user: User, teacherOnly = false, active = false) {
    const [discovered] = await connection.execute<(RowDataPacket & { class_id: number })[]>('SELECT class_id FROM live_sessions WHERE id=?', [id]);
    if (!discovered[0]) throw missing();
    const account = await access(connection, discovered[0].class_id, user, teacherOnly, active);
    const [rows] = await connection.execute<SessionRow[]>(`${fields} WHERE s.id=? FOR UPDATE`, [id]);
    if (!rows[0]) throw missing();
    if (active && rows[0].ended_at) throw new ApiError(409, 'LIVE_ENDED', 'คาบเรียนนี้จบแล้ว');
    return { row: rows[0], account };
  }
  const store: LiveStore = {
    list(classId, user) {
      return transaction(async connection => {
        await access(connection, classId, user);
        const [rows] = await connection.execute<SessionRow[]>(`${fields} WHERE s.class_id=? ORDER BY s.id DESC`, [classId]);
        return rows.map(mapSession);
      });
    },
    get(id, user, teacherOnly = false) {
      return transaction(async connection => mapSession((await sessionAccess(connection, id, user, teacherOnly)).row));
    },
    start(classId, user, title) {
      return transaction(async connection => {
        await access(connection, classId, user, true, true);
        const [active] = await connection.execute<RowDataPacket[]>('SELECT id FROM live_sessions WHERE class_id=? AND ended_at IS NULL FOR UPDATE', [classId]);
        if (active.length) throw new ApiError(409, 'LIVE_ALREADY_ACTIVE', 'มีคาบเรียนสดที่ยังไม่จบอยู่แล้ว');
        const [saved] = await connection.execute<ResultSetHeader>(
          'INSERT INTO live_sessions(class_id,title,room_name,started_at,created_by) VALUES(?,?,?,UTC_TIMESTAMP(),?)',
          [classId, title, `st-${randomBytes(24).toString('hex')}`, user.id],
        );
        const [rows] = await connection.execute<SessionRow[]>(`${fields} WHERE s.id=?`, [saved.insertId]);
        return mapSession(rows[0]!);
      });
    },
    issueToken(id, user) {
      return transaction(async connection => {
        await sessionAccess(connection, id, user, false, true);
        const token = randomBytes(32).toString('hex');
        await connection.execute('INSERT INTO live_tokens(live_session_id,user_id,token,expires_at) VALUES(?,?,?,UTC_TIMESTAMP()+INTERVAL 2 HOUR)', [id, user.id, token]);
        const [rows] = await connection.execute<(RowDataPacket & { expires_at: Date })[]>('SELECT expires_at FROM live_tokens WHERE token=?', [token]);
        return { token, expires_at: rows[0]!.expires_at.toISOString() };
      });
    },
    join(token, user) {
      if (!/^[a-f0-9]{64}$/.test(token)) return Promise.reject(invalidToken());
      return transaction(async connection => {
        const [discovered] = await connection.execute<(RowDataPacket & { live_session_id: number; user_id: number })[]>('SELECT live_session_id,user_id FROM live_tokens WHERE token=?', [token]);
        const candidate = discovered[0];
        if (!candidate || candidate.user_id !== user.id) throw invalidToken();
        const { row, account } = await sessionAccess(connection, candidate.live_session_id, user, false, true);
        // Check expiry after acquiring classroom/session locks, not before a possible wait.
        const [tokens] = await connection.execute<RowDataPacket[]>('SELECT id FROM live_tokens WHERE token=? AND user_id=? AND live_session_id=? AND expires_at>UTC_TIMESTAMP() FOR UPDATE', [token, user.id, row.id]);
        if (!tokens[0]) throw invalidToken();
        await connection.execute('UPDATE live_tokens SET used_at=COALESCE(used_at,UTC_TIMESTAMP()) WHERE id=?', [tokens[0].id]);
        await connection.execute('INSERT INTO live_attendance(live_session_id,user_id,joined_at) VALUES(?,?,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE left_at=NULL', [row.id, user.id]);
        return { session: mapSession(row), room_name: row.room_name, display_name: account.name };
      });
    },
    leave(id, user) {
      return transaction(async connection => {
        await sessionAccess(connection, id, user);
        await connection.execute('UPDATE live_attendance SET left_at=UTC_TIMESTAMP() WHERE live_session_id=? AND user_id=? AND left_at IS NULL', [id, user.id]);
      });
    },
    end(id, user) {
      return transaction(async connection => {
        const { row } = await sessionAccess(connection, id, user, true);
        if (!row.ended_at) {
          await connection.execute('UPDATE live_sessions SET ended_at=UTC_TIMESTAMP() WHERE id=?', [id]);
          await connection.execute('UPDATE live_attendance SET left_at=(SELECT ended_at FROM live_sessions WHERE id=?) WHERE live_session_id=? AND left_at IS NULL', [id, id]);
        }
        const [rows] = await connection.execute<SessionRow[]>(`${fields} WHERE s.id=?`, [id]);
        return mapSession(rows[0]!);
      });
    },
    attendance(id, user) {
      return transaction(async connection => {
        const { row } = await sessionAccess(connection, id, user, true);
        const [students] = await connection.execute<(RowDataPacket & { user_id: number; name: string; joined_at: Date | null; left_at: Date | null })[]>(
          `SELECT u.id AS user_id,u.name,a.joined_at,a.left_at FROM class_members cm JOIN users u ON u.id=cm.user_id
           LEFT JOIN live_attendance a ON a.user_id=u.id AND a.live_session_id=?
           WHERE cm.class_id=? AND u.role=? AND u.is_active=? ORDER BY u.name,u.id`, [id, row.class_id, 'student', 1],
        );
        return { session: mapSession(row), students: students.map(student => ({ user_id: student.user_id, name: student.name, joined_at: student.joined_at?.toISOString() ?? null, left_at: student.left_at?.toISOString() ?? null })) };
      });
    },
    async isAbsent(id, userId) {
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT u.id FROM live_sessions s JOIN classes c ON c.id=s.class_id
         JOIN class_members cm ON cm.class_id=c.id JOIN users u ON u.id=cm.user_id
         LEFT JOIN live_attendance a ON a.live_session_id=s.id AND a.user_id=u.id
         WHERE s.id=? AND u.id=? AND s.ended_at IS NOT NULL AND c.archived=? AND u.role=? AND u.is_active=? AND a.id IS NULL`, [id, userId, 0, 'student', 1],
      );
      return rows.length > 0;
    },
  };
  return store;
}
