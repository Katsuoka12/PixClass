import type { Pool, RowDataPacket } from 'mysql2/promise';
import type { CalendarItem, CalendarStore } from './calendar.js';
import type { User } from './types.js';
import { ApiError } from './middleware/errors.js';

type CalendarRow = RowDataPacket & {
  id: number; class_id: number; class_name: string; class_archived: number; title: string; description: string;
  due_at: Date; max_points: number; allow_late: number; created_at: Date;
  submission_id: number | null; student_id: number | null; answer_text: string | null; file_path: string | null;
  original_name: string | null; submitted_at: Date | null; grade: string | number | null;
  feedback: string | null; graded_at: Date | null; is_late: number | null;
};

function mapItem(row: CalendarRow): CalendarItem {
  const submission = row.submission_id === null ? null : {
    id: row.submission_id, assignment_id: row.id, student_id: row.student_id!, answer_text: row.answer_text!,
    file_path: row.file_path, original_name: row.original_name, submitted_at: row.submitted_at!.toISOString(),
    grade: row.grade === null ? null : Number(row.grade), feedback: row.feedback,
    graded_at: row.graded_at?.toISOString() ?? null, is_late: Boolean(row.is_late),
  };
  return {
    assignment: {
      id: row.id, class_id: row.class_id, class_name: row.class_name, class_archived: Boolean(row.class_archived),
      title: row.title, description: row.description, due_at: row.due_at.toISOString(), max_points: row.max_points,
      allow_late: Boolean(row.allow_late), created_at: row.created_at.toISOString(),
    },
    submission, status: !submission ? 'missing' : submission.grade !== null || submission.graded_at !== null ? 'graded' : submission.is_late ? 'late' : 'submitted',
  };
}

export function createCalendarStore(pool: Pool): CalendarStore {
  return {
    async month(month, user) {
      if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month.length !== 7) throw new ApiError(400, 'VALIDATION_ERROR', 'เดือนต้องอยู่ในรูปแบบ YYYY-MM');
      const year = Number(month.slice(0, 4));
      const monthNumber = Number(month.slice(5));
      if (year < 2000 || year > 2100) throw new ApiError(400, 'VALIDATION_ERROR', 'ปีต้องอยู่ระหว่าง 2000 และ 2100');
      const start = new Date(Date.UTC(year, monthNumber - 1, 1, -7));
      const end = new Date(Date.UTC(year, monthNumber, 1, -7));
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [users] = await connection.execute<(RowDataPacket & { role: User['role']; is_active: number })[]>(
          'SELECT role, is_active FROM users WHERE id = ? LOCK IN SHARE MODE', [user.id],
        );
        const current = users[0];
        if (!current?.is_active) throw new ApiError(401, 'UNAUTHENTICATED', 'กรุณาเข้าสู่ระบบอีกครั้ง');
        if (current.role !== 'teacher' && current.role !== 'student') throw new ApiError(403, 'FORBIDDEN', 'คุณไม่มีสิทธิ์ดูปฏิทินงาน');
        const [rows] = await connection.execute<CalendarRow[]>(
          `SELECT a.id, a.class_id, c.name AS class_name, c.archived AS class_archived,
             a.title, a.description, a.due_at, a.max_points, a.allow_late, a.created_at,
             s.id AS submission_id, s.student_id, s.answer_text, s.file_path, s.original_name,
             s.submitted_at, s.grade, s.feedback, s.graded_at, (s.submitted_at > a.due_at) AS is_late
           FROM assignments a JOIN classes c ON c.id = a.class_id
           LEFT JOIN submissions s ON s.assignment_id = a.id AND s.student_id = ? AND ? = 'student'
           WHERE c.archived = 0 AND a.due_at >= ? AND a.due_at < ? AND
             ((? = 'teacher' AND c.teacher_id = ?) OR (? = 'student' AND EXISTS
               (SELECT 1 FROM class_members m WHERE m.class_id = c.id AND m.user_id = ?)))
           ORDER BY a.due_at, a.id`,
          [user.id, current.role, start, end, current.role, user.id, current.role, user.id],
        );
        const items = rows.map(mapItem);
        if (current.role === 'teacher') for (const item of items) item.status = null;
        await connection.commit();
        return { month, timezone: 'Asia/Bangkok', items };
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally { connection.release(); }
    },
  };
}
