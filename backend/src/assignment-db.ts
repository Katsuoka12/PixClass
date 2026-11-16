import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { Assignment, AssignmentStore, Submission, SubmissionRow, TodoRow } from './assignments.js';
import type { User } from './types.js';
import { ApiError } from './middleware/errors.js';

type ClassRow = RowDataPacket & { id: number; teacher_id: number; archived: number };
type AssignmentRow = RowDataPacket & Omit<Assignment, 'due_at' | 'created_at' | 'allow_late' | 'class_archived'> & {
  due_at: Date | null; created_at: Date; allow_late: number; class_archived: number; deadline_passed: number;
};
type SubmissionRowData = RowDataPacket & Omit<Submission, 'submitted_at' | 'graded_at' | 'grade' | 'is_late'> & {
  submitted_at: Date; graded_at: Date | null; grade: string | number | null; is_late: number;
};
const mapAssignment = (a: AssignmentRow): Assignment => ({
  id: a.id, class_id: a.class_id, class_name: a.class_name, class_archived: Boolean(a.class_archived),
  title: a.title, description: a.description, due_at: a.due_at?.toISOString() ?? null,
  max_points: a.max_points, allow_late: Boolean(a.allow_late), created_at: a.created_at.toISOString(),
});
const mapSubmission = (s: SubmissionRowData): Submission => ({
  id: s.id, assignment_id: s.assignment_id, student_id: s.student_id, answer_text: s.answer_text,
  file_path: s.file_path, original_name: s.original_name, submitted_at: s.submitted_at.toISOString(),
  grade: s.grade === null ? null : Number(s.grade), feedback: s.feedback,
  graded_at: s.graded_at?.toISOString() ?? null, is_late: Boolean(s.is_late),
});
const forbidden = () => new ApiError(403, 'FORBIDDEN', 'คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้');
const assignmentMissing = () => new ApiError(404, 'ASSIGNMENT_NOT_FOUND', 'ไม่พบงานนี้');
const submissionMissing = () => new ApiError(404, 'SUBMISSION_NOT_FOUND', 'ไม่พบการส่งงานนี้');

export function createAssignmentStore(pool: Pool): AssignmentStore {
  async function transaction<T>(action: (connection: PoolConnection) => Promise<T>): Promise<T> {
    const connection = await pool.getConnection();
    try {
      // Discovery queries must not freeze membership/deadline reads before class locks are acquired.
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
  async function access(connection: PoolConnection, classId: number, user: User, teacherOnly = false, write = false) {
    // Class-first locks match classroom archive/removal and serialize grading with submission edits.
    const [rows] = await connection.execute<ClassRow[]>('SELECT id, teacher_id, archived FROM classes WHERE id = ? FOR UPDATE', [classId]);
    const classroom = rows[0];
    if (!classroom) throw new ApiError(404, 'CLASS_NOT_FOUND', 'ไม่พบห้องเรียน');
    if (user.role === 'teacher') {
      if (classroom.teacher_id !== user.id) throw forbidden();
    } else if (user.role === 'student' && !teacherOnly) {
      const [members] = await connection.execute<RowDataPacket[]>('SELECT id FROM class_members WHERE class_id = ? AND user_id = ? FOR UPDATE', [classId, user.id]);
      if (!members.length) throw forbidden();
    } else throw forbidden();
    if (write && classroom.archived) throw new ApiError(409, 'CLASS_ARCHIVED', 'ห้องเรียนที่เก็บแล้วไม่สามารถแก้ไขได้');
    return classroom;
  }
  async function readAssignment(connection: PoolConnection, id: number) {
    const [rows] = await connection.execute<AssignmentRow[]>(
      `SELECT a.*, c.name AS class_name, c.archived AS class_archived,
        (a.due_at IS NOT NULL AND UTC_TIMESTAMP() > a.due_at) AS deadline_passed
       FROM assignments a JOIN classes c ON c.id = a.class_id WHERE a.id = ? FOR UPDATE`, [id],
    );
    if (!rows[0]) throw assignmentMissing();
    return rows[0];
  }
  async function assignmentAccess(connection: PoolConnection, id: number, user: User, teacherOnly = false, write = false) {
    const [rows] = await connection.execute<(RowDataPacket & { class_id: number })[]>('SELECT class_id FROM assignments WHERE id = ?', [id]);
    if (!rows[0]) throw assignmentMissing();
    await access(connection, rows[0].class_id, user, teacherOnly, write);
    return readAssignment(connection, id);
  }
  async function readSubmission(connection: PoolConnection, assignmentId: number, studentId: number) {
    const [rows] = await connection.execute<SubmissionRowData[]>(
      `SELECT s.*, (a.due_at IS NOT NULL AND s.submitted_at > a.due_at) AS is_late
       FROM submissions s JOIN assignments a ON a.id = s.assignment_id
       WHERE s.assignment_id = ? AND s.student_id = ? FOR UPDATE`, [assignmentId, studentId],
    );
    return rows[0] ? mapSubmission(rows[0]) : null;
  }
  async function submissionAccess(connection: PoolConnection, id: number, user: User, teacherOnly = false, write = false) {
    const [rows] = await connection.execute<(RowDataPacket & { assignment_id: number; student_id: number })[]>(
      'SELECT assignment_id, student_id FROM submissions WHERE id = ?', [id],
    );
    if (!rows[0]) throw submissionMissing();
    const assignment = await assignmentAccess(connection, rows[0].assignment_id, user, teacherOnly, write);
    const submission = await readSubmission(connection, assignment.id, rows[0].student_id);
    if (!submission || submission.id !== id) throw submissionMissing();
    return { assignment, submission };
  }
  async function listAssignments(connection: PoolConnection, classId: number) {
    const [rows] = await connection.execute<AssignmentRow[]>(
      `SELECT a.*, c.name AS class_name, c.archived AS class_archived FROM assignments a
       JOIN classes c ON c.id = a.class_id WHERE a.class_id = ? ORDER BY a.created_at DESC, a.id DESC`, [classId],
    );
    return rows.map(mapAssignment);
  }
  async function members(connection: PoolConnection, classId: number) {
    const [rows] = await connection.execute<(RowDataPacket & { id: number; name: string })[]>(
      `SELECT u.id, u.name FROM class_members m JOIN users u ON u.id = m.user_id
       WHERE m.class_id = ? AND u.role = 'student' ORDER BY u.name, u.id`, [classId],
    );
    return rows;
  }
  const store: AssignmentStore = {
    list(classId, user) {
      return transaction(async connection => {
        await access(connection, classId, user);
        return listAssignments(connection, classId);
      });
    },
    get(id, user) { return transaction(async connection => mapAssignment(await assignmentAccess(connection, id, user))); },
    create(classId, user, input) {
      return transaction(async connection => {
        await access(connection, classId, user, true, true);
        const [result] = await connection.execute<ResultSetHeader>(
          `INSERT INTO assignments (class_id, title, description, due_at, max_points, allow_late, created_at)
           VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
          [classId, input.title, input.description, input.due_at ? new Date(input.due_at) : null, input.max_points, input.allow_late],
        );
        return mapAssignment(await readAssignment(connection, result.insertId));
      });
    },
    update(id, user, input) {
      return transaction(async connection => {
        const assignment = await assignmentAccess(connection, id, user, true, true);
        if (input.max_points !== undefined) {
          const [rows] = await connection.execute<RowDataPacket[]>('SELECT id FROM submissions WHERE assignment_id = ? AND grade > ? LIMIT 1 FOR UPDATE', [id, input.max_points]);
          if (rows.length) throw new ApiError(409, 'MAX_POINTS_BELOW_GRADE', 'คะแนนเต็มต้องไม่น้อยกว่าคะแนนที่ตรวจแล้ว');
        }
        const due = input.due_at === undefined ? assignment.due_at : input.due_at ? new Date(input.due_at) : null;
        await connection.execute(
          'UPDATE assignments SET title = ?, description = ?, due_at = ?, max_points = ?, allow_late = ? WHERE id = ?',
          [input.title ?? assignment.title, input.description ?? assignment.description, due, input.max_points ?? assignment.max_points, input.allow_late ?? assignment.allow_late, id],
        );
        return mapAssignment(await readAssignment(connection, id));
      });
    },
    delete(id, user) {
      return transaction(async connection => {
        await assignmentAccess(connection, id, user, true, true);
        const [files] = await connection.execute<(RowDataPacket & { file_path: string })[]>('SELECT file_path FROM submissions WHERE assignment_id = ? AND file_path IS NOT NULL FOR UPDATE', [id]);
        await connection.execute('DELETE FROM submissions WHERE assignment_id = ?', [id]);
        await connection.execute('DELETE FROM assignments WHERE id = ?', [id]);
        return files.map(row => row.file_path);
      });
    },
    getSubmission(assignmentId, user) {
      return transaction(async connection => {
        if (user.role !== 'student') throw forbidden();
        await assignmentAccess(connection, assignmentId, user);
        return readSubmission(connection, assignmentId, user.id);
      });
    },
    submit(assignmentId, user, input) {
      return transaction(async connection => {
        if (user.role !== 'student') throw forbidden();
        const assignment = await assignmentAccess(connection, assignmentId, user, false, true);
        const previous = await readSubmission(connection, assignmentId, user.id);
        if (previous && (previous.grade !== null || previous.graded_at !== null)) throw new ApiError(409, 'ALREADY_GRADED', 'งานที่ตรวจแล้วไม่สามารถแก้ไขได้');
        if (!assignment.allow_late && assignment.deadline_passed) throw new ApiError(409, 'DEADLINE_PASSED', 'พ้นกำหนดส่งงานแล้ว');
        const file = input.file?.file_path ?? (input.remove_file ? null : previous?.file_path ?? null);
        const originalName = input.file?.original_name ?? (input.remove_file ? null : previous?.original_name ?? null);
        if (!input.answer_text.trim() && !file) throw new ApiError(400, 'EMPTY_SUBMISSION', 'กรุณาใส่คำตอบหรือแนบไฟล์');
        await connection.execute(
          `INSERT INTO submissions (assignment_id, student_id, answer_text, file_path, original_name, submitted_at)
           VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE answer_text = VALUES(answer_text),
           file_path = VALUES(file_path), original_name = VALUES(original_name), submitted_at = UTC_TIMESTAMP()`,
          [assignmentId, user.id, input.answer_text, file, originalName],
        );
        const submission = await readSubmission(connection, assignmentId, user.id);
        if (!submission) throw submissionMissing();
        return { submission, replacedFile: previous?.file_path && previous.file_path !== file ? previous.file_path : null };
      });
    },
    submissions(assignmentId, user) {
      return transaction(async connection => {
        const assignment = await assignmentAccess(connection, assignmentId, user, true);
        const students = await members(connection, assignment.class_id);
        const result: SubmissionRow[] = [];
        for (const student of students) {
          const submission = await readSubmission(connection, assignmentId, student.id);
          result.push({ student_id: student.id, student_name: student.name, status: !submission ? 'missing' : submission.is_late ? 'late' : 'submitted', submission });
        }
        return result;
      });
    },
    grade(submissionId, user, input) {
      return transaction(async connection => {
        const { assignment, submission } = await submissionAccess(connection, submissionId, user, true, true);
        if (!Number.isFinite(input.grade) || input.grade < 0 || input.grade > assignment.max_points || Math.abs(input.grade * 100 - Math.round(input.grade * 100)) > 0.0000001) {
          throw new ApiError(400, 'GRADE_EXCEEDS_MAX', 'คะแนนต้องอยู่ระหว่างศูนย์และคะแนนเต็ม และมีทศนิยมไม่เกินสองตำแหน่ง');
        }
        await connection.execute('UPDATE submissions SET grade = ?, feedback = ?, graded_at = UTC_TIMESTAMP() WHERE id = ?', [input.grade, input.feedback, submissionId]);
        return (await readSubmission(connection, assignment.id, submission.student_id))!;
      });
    },
    file(submissionId, user) {
      return transaction(async connection => {
        const { submission } = await submissionAccess(connection, submissionId, user);
        if (user.role === 'student' && submission.student_id !== user.id) throw forbidden();
        if (!submission.file_path) throw new ApiError(404, 'FILE_NOT_FOUND', 'ไม่พบไฟล์แนบ');
        return submission;
      });
    },
    gradebook(classId, user) {
      return transaction(async connection => {
        await access(connection, classId, user, true);
        const assignments = await listAssignments(connection, classId);
        const students = await members(connection, classId);
        const [rows] = await connection.execute<SubmissionRowData[]>(
          `SELECT s.*, (a.due_at IS NOT NULL AND s.submitted_at > a.due_at) AS is_late FROM submissions s
           JOIN assignments a ON a.id = s.assignment_id WHERE a.class_id = ? ORDER BY s.assignment_id, s.id`, [classId],
        );
        const submissions = rows.map(mapSubmission);
        return { assignments, students: students.map(student => ({ id: student.id, name: student.name, submissions: submissions.filter(s => s.student_id === student.id) })) };
      });
    },
    todo(user) {
      return transaction(async connection => {
        if (user.role !== 'student') throw forbidden();
        const [rows] = await connection.execute<AssignmentRow[]>(
          `SELECT a.*, c.name AS class_name, c.archived AS class_archived FROM assignments a
           JOIN classes c ON c.id = a.class_id JOIN class_members m ON m.class_id = c.id
           WHERE m.user_id = ? AND c.archived = 0 ORDER BY a.due_at IS NULL, a.due_at, a.id`, [user.id],
        );
        const [submissionRows] = await connection.execute<SubmissionRowData[]>(
          `SELECT s.*, (a.due_at IS NOT NULL AND s.submitted_at > a.due_at) AS is_late FROM submissions s
           JOIN assignments a ON a.id = s.assignment_id JOIN classes c ON c.id = a.class_id
           JOIN class_members m ON m.class_id = c.id AND m.user_id = s.student_id
           WHERE s.student_id = ? AND c.archived = 0`, [user.id],
        );
        const submissions = new Map(submissionRows.map(row => [row.assignment_id, mapSubmission(row)]));
        const items: TodoRow[] = [];
        for (const assignment of rows) {
          const submission = submissions.get(assignment.id) ?? null;
          const status = !submission ? 'missing' : submission.grade !== null || submission.graded_at !== null ? 'graded' : submission.is_late ? 'late' : 'submitted';
          items.push({ assignment: mapAssignment(assignment), submission, status });
        }
        return items;
      });
    },
  };
  return store;
}
