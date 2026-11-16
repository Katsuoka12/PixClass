import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { Announcement, Classroom, ClassStore } from './classrooms.js';

type ClassRow = RowDataPacket & Omit<Classroom, 'created_at' | 'archived'> & { created_at: Date; archived: number };
type AnnouncementRow = RowDataPacket & Omit<Announcement, 'created_at'> & { created_at: Date };
const mapClass = (row: ClassRow): Classroom => ({ ...row, archived: Boolean(row.archived), created_at: row.created_at.toISOString() });
const mapPost = (row: AnnouncementRow): Announcement => ({ ...row, created_at: row.created_at.toISOString() });

export function createClassStore(pool: Pool): ClassStore {
  async function find(id: number | null, code: string | null) {
    const [rows] = await pool.execute<ClassRow[]>(
      `SELECT c.*, u.name AS teacher_name, (SELECT COUNT(*) FROM class_members m WHERE m.class_id = c.id) AS member_count
       FROM classes c JOIN users u ON u.id = c.teacher_id WHERE c.id = ? OR c.join_code = ? LIMIT 1`, [id, code],
    );
    return rows[0] ? mapClass(rows[0]) : undefined;
  }
  return {
    async list(user) {
      const [rows] = await pool.execute<ClassRow[]>(
        `SELECT c.*, u.name AS teacher_name, (SELECT COUNT(*) FROM class_members m WHERE m.class_id = c.id) AS member_count
         FROM classes c JOIN users u ON u.id = c.teacher_id
         WHERE (? = 'teacher' AND c.teacher_id = ?) OR (? = 'student' AND EXISTS
           (SELECT 1 FROM class_members m WHERE m.class_id = c.id AND m.user_id = ?))
         ORDER BY c.archived ASC, c.created_at DESC, c.id DESC`, [user.role, user.id, user.role, user.id],
      );
      return rows.map(mapClass);
    },
    get(id) { return find(id, null); },
    getByCode(code) { return find(null, code); },
    async isMember(classId, userId) {
      const [rows] = await pool.execute<RowDataPacket[]>('SELECT id FROM class_members WHERE class_id = ? AND user_id = ?', [classId, userId]);
      return rows.length > 0;
    },
    async create(teacher, input) {
      const [result] = await pool.execute<ResultSetHeader>(
        'INSERT INTO classes (teacher_id, name, section, join_code, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())', [teacher.id, input.name, input.section, input.join_code],
      );
      return result.insertId;
    },
    async update(id, teacherId, input) {
      const [result] = await pool.execute<ResultSetHeader>(
        `UPDATE classes SET name = COALESCE(?, name), section = COALESCE(?, section), archived = COALESCE(?, archived)
         WHERE id = ? AND teacher_id = ? AND archived = 0`, [input.name ?? null, input.section ?? null, input.archived ?? null, id, teacherId],
      );
      return result.affectedRows > 0;
    },
    async addMember(classId, userId) {
      const [result] = await pool.execute<ResultSetHeader>(
        `INSERT INTO class_members (class_id, user_id, joined_at) SELECT id, ?, UTC_TIMESTAMP() FROM classes WHERE id = ? AND archived = 0
         ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)`, [userId, classId],
      );
      return result.affectedRows > 0;
    },
    async removeMember(classId, teacherId, userId) {
      const [result] = await pool.execute<ResultSetHeader>(
        `DELETE m FROM class_members m JOIN classes c ON c.id = m.class_id
         WHERE m.class_id = ? AND m.user_id = ? AND c.teacher_id = ? AND c.archived = 0`, [classId, userId, teacherId],
      );
      return result.affectedRows > 0;
    },
    async members(classId) {
      const [rows] = await pool.execute<(RowDataPacket & { id: number; name: string; joined_at: Date })[]>(
        `SELECT u.id, u.name, m.joined_at FROM class_members m JOIN users u ON u.id = m.user_id
         WHERE m.class_id = ? ORDER BY u.name, u.id`, [classId],
      );
      return rows.map(row => ({ ...row, joined_at: row.joined_at.toISOString() }));
    },
    async announcements(classId) {
      const [rows] = await pool.execute<AnnouncementRow[]>(
        `SELECT a.*, u.name AS author_name FROM announcements a JOIN users u ON u.id = a.author_id
         WHERE a.class_id = ? ORDER BY a.created_at DESC, a.id DESC`, [classId],
      );
      return rows.map(mapPost);
    },
    async post(classId, teacherId, body) {
      const [result] = await pool.execute<ResultSetHeader>(
        `INSERT INTO announcements (class_id, author_id, body, created_at)
         SELECT id, ?, ?, UTC_TIMESTAMP() FROM classes WHERE id = ? AND teacher_id = ? AND archived = 0`, [teacherId, body, classId, teacherId],
      );
      if (!result.affectedRows) return undefined;
      const [rows] = await pool.execute<AnnouncementRow[]>(
        'SELECT a.*, u.name AS author_name FROM announcements a JOIN users u ON u.id = a.author_id WHERE a.id = ?', [result.insertId],
      );
      return rows[0] ? mapPost(rows[0]) : undefined;
    },
  };
}
