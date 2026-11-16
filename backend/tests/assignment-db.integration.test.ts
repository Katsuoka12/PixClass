import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { loadConfig } from '../src/config.js';
import { createPool } from '../src/db.js';
import { createClassStore } from '../src/class-db.js';
import { createAssignmentStore } from '../src/assignment-db.js';
import type { AssignmentInput, AssignmentStore } from '../src/assignments.js';
import type { User } from '../src/types.js';

describe.skipIf(process.env.RUN_DB_TESTS !== '1')('MariaDB assignment repository', () => {
  let pool: Pool;
  let store: AssignmentStore;
  let teacher: User;
  let otherTeacher: User;
  let student: User;
  let peer: User;
  let admin: User;
  const users: number[] = [];
  const rooms: number[] = [];
  const input: AssignmentInput = { title: 'งานภาษาไทย', description: 'รายละเอียด', due_at: null, max_points: 100, allow_late: true };

  beforeAll(async () => {
    const config = loadConfig();
    if (config.DB_NAME !== 'student_tag_m1_test') throw new Error('DB tests require DB_NAME=student_tag_m1_test');
    pool = createPool(config);
    store = createAssignmentStore(pool);
    async function user(role: User['role']): Promise<User> {
      const email = `${randomUUID()}@assignment.test`;
      const [result] = await pool.execute<ResultSetHeader>('INSERT INTO users (role, name, email, password_hash) VALUES (?, ?, ?, ?)', [role, role, email, 'unused-test-hash']);
      users.push(result.insertId);
      return { id: result.insertId, role, name: role, email, password_hash: 'unused-test-hash', is_active: 1 };
    }
    teacher = await user('teacher');
    otherTeacher = await user('teacher');
    student = await user('student');
    peer = await user('student');
    admin = await user('admin');
  });
  afterAll(async () => {
    if (!pool) return;
    for (const id of rooms) {
      await pool.execute('DELETE s FROM submissions s JOIN assignments a ON a.id = s.assignment_id WHERE a.class_id = ?', [id]);
      await pool.execute('DELETE FROM assignments WHERE class_id = ?', [id]);
      await pool.execute('DELETE FROM class_members WHERE class_id = ?', [id]);
      await pool.execute('DELETE FROM classes WHERE id = ?', [id]);
    }
    for (const id of users) await pool.execute('DELETE FROM users WHERE id = ?', [id]);
    await pool.end();
  });
  async function room() {
    const [result] = await pool.execute<ResultSetHeader>('INSERT INTO classes (teacher_id, name, join_code) VALUES (?, ?, ?)', [teacher.id, 'ห้อง M3', randomUUID().slice(0, 20)]);
    rooms.push(result.insertId);
    await pool.execute('INSERT INTO class_members (class_id, user_id) VALUES (?, ?), (?, ?)', [result.insertId, student.id, result.insertId, peer.id]);
    return result.insertId;
  }
  async function fixture(change: Partial<AssignmentInput> = {}) {
    const classId = await room();
    const assignment = await store.create(classId, teacher, { ...input, ...change });
    return { classId, assignment };
  }
  const answer = { answer_text: 'คำตอบ', remove_file: false };

  it('round-trips prepared literal content and UTC dates through list/get/update', async () => {
    const { classId, assignment } = await fixture({ description: "'); DROP TABLE users; --", due_at: '2035-01-01T10:30:00+07:00' });
    expect(assignment.due_at).toBe('2035-01-01T03:30:00.000Z');
    expect(Math.abs(Date.now() - Date.parse(assignment.created_at))).toBeLessThan(10_000);
    expect((await store.list(classId, student))[0]?.description).toBe("'); DROP TABLE users; --");
    expect((await store.update(assignment.id, teacher, { due_at: null, title: 'แก้ไข' })).due_at).toBeNull();
    expect((await store.get(assignment.id, student)).title).toBe('แก้ไข');
  });

  it('rejects foreign teachers/admins and teacher-only/self-only operations at the repository boundary', async () => {
    const { classId, assignment } = await fixture();
    for (const user of [otherTeacher, admin]) {
      await expect(store.list(classId, user)).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(store.get(assignment.id, user)).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(store.create(classId, user, input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(store.update(assignment.id, user, { title: 'wrong' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(store.delete(assignment.id, user)).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(store.gradebook(classId, user)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }
    await expect(store.getSubmission(assignment.id, teacher)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(store.submit(assignment.id, teacher, answer)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(store.submissions(assignment.id, student)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(store.todo(teacher)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(store.get(4_000_000_000, student)).rejects.toMatchObject({ code: 'ASSIGNMENT_NOT_FOUND' });
  });

  it('preserves existing attachments on text edits and only returns replaced filenames after successful replacement/removal', async () => {
    const { assignment } = await fixture();
    expect(await store.getSubmission(assignment.id, student)).toBeNull();
    await expect(store.submit(assignment.id, student, { answer_text: '', remove_file: false })).rejects.toMatchObject({ code: 'EMPTY_SUBMISSION' });
    const first = await store.submit(assignment.id, student, { answer_text: '', file: { file_path: 'one.pdf', original_name: 'ต้นฉบับ.pdf' }, remove_file: false });
    expect(first.replacedFile).toBeNull();
    const edit = await store.submit(assignment.id, student, answer);
    expect(edit.submission).toMatchObject({ id: first.submission.id, file_path: 'one.pdf', original_name: 'ต้นฉบับ.pdf' });
    expect(edit.replacedFile).toBeNull();
    await expect(store.submit(assignment.id, student, { answer_text: '', remove_file: true })).rejects.toMatchObject({ code: 'EMPTY_SUBMISSION' });
    expect((await store.getSubmission(assignment.id, student))?.file_path).toBe('one.pdf');
    const replaced = await store.submit(assignment.id, student, { ...answer, file: { file_path: 'two.pdf', original_name: 'second.pdf' } });
    expect(replaced.replacedFile).toBe('one.pdf');
    const removed = await store.submit(assignment.id, student, { ...answer, remove_file: true });
    expect(removed.replacedFile).toBe('two.pdf');
    expect(removed.submission.file_path).toBeNull();
  });

  it('uses database deadlines, classifies late submissions and rejects closed-deadline edits', async () => {
    const { assignment } = await fixture({ due_at: '2001-01-01T00:00:00Z' });
    const sent = await store.submit(assignment.id, student, answer);
    expect(sent.submission.is_late).toBe(true);
    await store.update(assignment.id, teacher, { allow_late: false });
    await expect(store.submit(assignment.id, student, answer)).rejects.toMatchObject({ code: 'DEADLINE_PASSED' });
    await store.update(assignment.id, teacher, { due_at: '2035-01-01T00:00:00Z' });
    expect((await store.getSubmission(assignment.id, student))?.is_late).toBe(false);
  });

  it('handles decimal grading, zero-grade locks and maximum-score changes atomically', async () => {
    const { assignment } = await fixture();
    const { submission } = await store.submit(assignment.id, student, answer);
    for (const grade of [-1, 100.01, 1.001, Number.NaN]) await expect(store.grade(submission.id, teacher, { grade, feedback: '' })).rejects.toMatchObject({ status: 400 });
    await expect(store.grade(submission.id, peer, { grade: 10, feedback: '' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const marked = await store.grade(submission.id, teacher, { grade: 85.25, feedback: 'ดี' });
    expect(marked.grade).toBe(85.25);
    expect(marked.feedback).toBe('ดี');
    await expect(store.update(assignment.id, teacher, { max_points: 85 })).rejects.toMatchObject({ code: 'MAX_POINTS_BELOW_GRADE' });
    expect((await store.get(assignment.id, teacher)).max_points).toBe(100);
    const zero = await store.grade(submission.id, teacher, { grade: 0, feedback: '' });
    expect(zero.grade).toBe(0);
    expect(zero.graded_at).not.toBeNull();
    await expect(store.submit(assignment.id, student, answer)).rejects.toMatchObject({ code: 'ALREADY_GRADED' });
  });

  it('returns all current students, actual submission arrays and student-only active enrolled todo', async () => {
    const { classId, assignment } = await fixture();
    const { submission } = await store.submit(assignment.id, student, answer);
    const rows = await store.submissions(assignment.id, teacher);
    expect(rows.find(row => row.student_id === student.id)).toMatchObject({ status: 'submitted', submission: { id: submission.id } });
    expect(rows.find(row => row.student_id === peer.id)).toMatchObject({ status: 'missing', submission: null });
    const book = await store.gradebook(classId, teacher);
    expect(book.assignments.map(a => a.id)).toEqual([assignment.id]);
    expect(book.students.find(s => s.id === student.id)?.submissions.map(s => s.id)).toEqual([submission.id]);
    expect(book.students.find(s => s.id === peer.id)?.submissions).toEqual([]);
    await store.grade(submission.id, teacher, { grade: 0, feedback: '' });
    expect((await store.todo(student)).find(row => row.assignment.id === assignment.id)?.status).toBe('graded');
    await pool.execute('UPDATE classes SET archived = 1 WHERE id = ?', [classId]);
    expect((await store.todo(student)).some(row => row.assignment.id === assignment.id)).toBe(false);
  });

  it('revokes file and assignment access immediately after membership removal', async () => {
    const { classId, assignment } = await fixture();
    const { submission } = await store.submit(assignment.id, student, { ...answer, file: { file_path: 'private.pdf', original_name: 'original.pdf' } });
    expect((await store.file(submission.id, student)).file_path).toBe('private.pdf');
    expect((await store.file(submission.id, teacher)).file_path).toBe('private.pdf');
    for (const user of [peer, admin, otherTeacher]) await expect(store.file(submission.id, user)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await pool.execute('DELETE FROM class_members WHERE class_id = ? AND user_id = ?', [classId, student.id]);
    await expect(store.file(submission.id, student)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(store.getSubmission(assignment.id, student)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(store.submit(assignment.id, student, answer)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await store.submissions(assignment.id, teacher)).map(row => row.student_id)).toEqual([peer.id]);
    expect((await store.todo(student)).some(row => row.assignment.id === assignment.id)).toBe(false);
  });

  it('keeps archived class reads but rejects every write and rolls back failed operations', async () => {
    const { classId, assignment } = await fixture();
    const { submission } = await store.submit(assignment.id, student, answer);
    await pool.execute('UPDATE classes SET archived = 1 WHERE id = ?', [classId]);
    expect((await store.get(assignment.id, student)).class_archived).toBe(true);
    for (const action of [() => store.create(classId, teacher, input), () => store.update(assignment.id, teacher, { title: 'wrong' }), () => store.delete(assignment.id, teacher), () => store.submit(assignment.id, student, answer), () => store.grade(submission.id, teacher, { grade: 1, feedback: '' })]) {
      await expect(action()).rejects.toMatchObject({ code: 'CLASS_ARCHIVED' });
    }
    expect((await store.getSubmission(assignment.id, student))?.grade).toBeNull();
  });

  it('serializes concurrent first submissions and grade/edit, deleting related rows with cleanup filenames', async () => {
    const { assignment } = await fixture();
    const edits = await Promise.all([store.submit(assignment.id, student, answer), store.submit(assignment.id, student, { ...answer, answer_text: 'แก้' })]);
    expect(edits[0].submission.id).toBe(edits[1].submission.id);
    const submissionId = edits[0].submission.id;
    await Promise.allSettled([store.grade(submissionId, teacher, { grade: 0, feedback: '' }), store.submit(assignment.id, student, { ...answer, answer_text: 'ล่าสุด' })]);
    expect((await store.getSubmission(assignment.id, student))?.grade).toBe(0);
    await store.submit(assignment.id, peer, { ...answer, file: { file_path: 'delete.pdf', original_name: 'delete.pdf' } });
    expect(await store.delete(assignment.id, teacher)).toEqual(['delete.pdf']);
    const [rows] = await pool.execute<RowDataPacket[]>('SELECT COUNT(*) AS total FROM submissions WHERE assignment_id = ?', [assignment.id]);
    expect(rows[0]?.total).toBe(0);
    await expect(store.get(assignment.id, teacher)).rejects.toMatchObject({ code: 'ASSIGNMENT_NOT_FOUND' });
  });

  it('rechecks archive and membership after waiting for the classroom lock', async () => {
    for (const change of ['archive', 'remove'] as const) {
      const { classId, assignment } = await fixture();
      const blocker = await pool.getConnection();
      let pending: Promise<unknown> | undefined;
      try {
        await blocker.beginTransaction();
        await blocker.execute('SELECT id FROM classes WHERE id = ? FOR UPDATE', [classId]);
        pending = store.submit(assignment.id, student, answer);
        // Capture both outcomes even if lock observation fails, so cleanup cannot leak a rejection.
        const outcome = pending.then(() => ({ error: null }), (error: unknown) => ({ error }));
        let observed: { error: unknown } | undefined;
        void outcome.then(value => { observed = value; });
        let waiting = false;
        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
          // MariaDB may omit the READ COMMITTED waiter from INNODB_LOCK_WAITS.
          // Observe the actual locking statement while our blocker still owns the row.
          const [sessions] = await pool.execute<RowDataPacket[]>(
            'SELECT ID FROM information_schema.PROCESSLIST WHERE DB = ? AND INFO = ?',
            ['student_tag_m1_test', 'SELECT id, teacher_id, archived FROM classes WHERE id = ? FOR UPDATE'],
          );
          if (sessions.length && !observed) { waiting = true; break; }
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        expect(waiting).toBe(true);
        if (change === 'archive') await blocker.execute('UPDATE classes SET archived = 1 WHERE id = ?', [classId]);
        else await blocker.execute('DELETE FROM class_members WHERE class_id = ? AND user_id = ?', [classId, student.id]);
        await blocker.commit();
        expect((await outcome).error).toMatchObject({ code: change === 'archive' ? 'CLASS_ARCHIVED' : 'FORBIDDEN' });
        const [rows] = await pool.execute<RowDataPacket[]>('SELECT COUNT(*) AS total FROM submissions WHERE assignment_id = ?', [assignment.id]);
        expect(rows[0]?.total).toBe(0);
      } finally {
        await blocker.rollback();
        blocker.release();
        if (pending) await Promise.allSettled([pending]);
      }
    }
  }, 15000);

  it('never permits submission after classroom-store removal wins a concurrent race', async () => {
    const classStore = createClassStore(pool);
    for (let attempt = 0; attempt < 5; attempt++) {
      const { classId, assignment } = await fixture();
      const outcomes = await Promise.allSettled([
        classStore.removeMember(classId, teacher.id, student.id),
        store.submit(assignment.id, student, answer),
      ]);
      expect(outcomes[0]).toMatchObject({ status: 'fulfilled', value: true });
      const submission = outcomes[1]!;
      if (submission.status === 'rejected') expect(submission.reason).toMatchObject({ code: 'FORBIDDEN' });
      await expect(store.submit(assignment.id, student, answer)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }
  });

  it('reads todo without waiting for a writer holding an assignment row', async () => {
    const { assignment } = await fixture();
    await store.submit(assignment.id, student, answer);
    const blocker = await pool.getConnection();
    let completedBeforeUnlock = false;
    let pending: ReturnType<AssignmentStore['todo']> | undefined;
    try {
      await blocker.beginTransaction();
      await blocker.execute('SELECT id FROM assignments WHERE id = ? FOR UPDATE', [assignment.id]);
      pending = store.todo(student);
      completedBeforeUnlock = await Promise.race([pending.then(() => true), new Promise<false>(resolve => setTimeout(() => resolve(false), 200))]);
    } finally {
      await blocker.rollback();
      blocker.release();
      if (pending) await pending;
    }
    expect(completedBeforeUnlock).toBe(true);
  });
});
