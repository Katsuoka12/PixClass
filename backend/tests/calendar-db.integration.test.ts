import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool, ResultSetHeader } from 'mysql2/promise';
import { createCalendarStore } from '../src/calendar-db.js';
import type { CalendarStore } from '../src/calendar.js';
import { loadConfig } from '../src/config.js';
import { createPool } from '../src/db.js';
import type { User } from '../src/types.js';

describe.skipIf(process.env.RUN_DB_TESTS !== '1')('MariaDB calendar repository', () => {
  let pool: Pool;
  let store: CalendarStore;
  let teacher: User;
  let foreignTeacher: User;
  let student: User;
  let peer: User;
  let admin: User;
  const ids: number[] = [];
  const rooms: number[] = [];
  async function user(role: User['role']): Promise<User> {
    const email = `${randomUUID()}@calendar.test`;
    const [result] = await pool.execute<ResultSetHeader>('INSERT INTO users (role, name, email, password_hash) VALUES (?, ?, ?, ?)', [role, role, email, 'unused-fixture-hash']);
    ids.push(result.insertId);
    return { id: result.insertId, role, name: role, email, password_hash: 'unused-fixture-hash', is_active: 1 };
  }
  async function room(owner = teacher, member = student, archived = false) {
    const [result] = await pool.execute<ResultSetHeader>('INSERT INTO classes (teacher_id, name, join_code, archived) VALUES (?, ?, ?, ?)', [owner.id, 'ปฏิทิน', randomUUID().slice(0, 20), archived]);
    rooms.push(result.insertId);
    await pool.execute('INSERT INTO class_members (class_id, user_id) VALUES (?, ?)', [result.insertId, member.id]);
    return result.insertId;
  }
  async function assignment(classId: number, due: string | null, title: string) {
    const [result] = await pool.execute<ResultSetHeader>('INSERT INTO assignments (class_id, title, description, due_at) VALUES (?, ?, ?, ?)', [classId, title, 'รายละเอียด', due]);
    return result.insertId;
  }
  beforeAll(async () => {
    const config = loadConfig();
    if (config.DB_NAME !== 'student_tag_m1_test') throw new Error('DB tests require student_tag_m1_test');
    pool = createPool(config);
    store = createCalendarStore(pool);
    teacher = await user('teacher');
    foreignTeacher = await user('teacher');
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
    for (const id of ids) await pool.execute('DELETE FROM users WHERE id = ?', [id]);
    await pool.end();
  });

  it('selects exact Bangkok month UTC bounds, including leap day and year rollover', async () => {
    const classId = await room();
    await assignment(classId, '2024-01-31 16:59:59', 'ก่อนเดือน');
    const start = await assignment(classId, '2024-01-31 17:00:00', 'ต้นเดือน');
    const leap = await assignment(classId, '2024-02-29 16:59:59', 'วันอธิกสุรทิน');
    const next = await assignment(classId, '2024-02-29 17:00:00', 'เดือนถัดไป');
    await assignment(classId, null, 'ไม่กำหนดส่ง');
    const february = await store.month('2024-02', student);
    expect(february).toMatchObject({ month: '2024-02', timezone: 'Asia/Bangkok' });
    expect(february.items.map(item => item.assignment.id)).toEqual([start, leap]);
    expect(february.items[0]?.assignment.due_at).toBe('2024-01-31T17:00:00.000Z');
    expect((await store.month('2024-03', student)).items.map(item => item.assignment.id)).toContain(next);
    const december = await assignment(classId, '2024-12-31 16:59:59', 'สิ้นปี');
    const january = await assignment(classId, '2024-12-31 17:00:00', 'ปีใหม่');
    expect((await store.month('2024-12', student)).items.map(item => item.assignment.id)).toEqual([december]);
    expect((await store.month('2025-01', student)).items.map(item => item.assignment.id)).toEqual([january]);
    const century = await assignment(classId, '2100-02-28 16:59:59', 'ไม่ใช่ปีอธิกสุรทิน');
    await assignment(classId, '2100-02-28 17:00:00', 'มีนาคม');
    expect((await store.month('2100-02', student)).items.map(item => item.assignment.id)).toEqual([century]);
  });

  it('limits teacher ownership and student enrollment to current unarchived classrooms', async () => {
    const owned = await room();
    const foreign = await room(foreignTeacher, peer);
    const archived = await room(teacher, student, true);
    const visible = await assignment(owned, '2036-05-01 00:00:00', 'เห็นได้');
    await assignment(foreign, '2036-05-01 00:00:00', 'ห้องอื่น');
    await assignment(archived, '2036-05-01 00:00:00', 'เก็บแล้ว');
    for (const actor of [teacher, student]) expect((await store.month('2036-05', actor)).items.map(item => item.assignment.id)).toEqual([visible]);
    await pool.execute('DELETE FROM class_members WHERE class_id = ? AND user_id = ?', [owned, student.id]);
    expect((await store.month('2036-05', student)).items).toEqual([]);
    expect((await store.month('2036-05', teacher)).items.map(item => item.assignment.id)).toEqual([visible]);
  });

  it('returns only the current student submission with missing/submitted/late/zero-grade status', async () => {
    const classId = await room();
    await pool.execute('INSERT INTO class_members (class_id, user_id) VALUES (?, ?)', [classId, peer.id]);
    const missing = await assignment(classId, '2037-08-10 00:00:00', 'ยังไม่ส่ง');
    const onTime = await assignment(classId, '2037-08-11 00:00:00', 'ส่งแล้ว');
    const late = await assignment(classId, '2037-08-12 00:00:00', 'ส่งช้า');
    const zero = await assignment(classId, '2037-08-13 00:00:00', 'ตรวจแล้ว');
    await pool.execute('INSERT INTO submissions (assignment_id, student_id, answer_text, submitted_at) VALUES (?, ?, ?, ?)', [missing, peer.id, 'คำตอบส่วนตัวของคนอื่น', '2037-08-01 00:00:00']);
    await pool.execute('INSERT INTO submissions (assignment_id, student_id, answer_text, submitted_at) VALUES (?, ?, ?, ?), (?, ?, ?, ?)', [onTime, student.id, 'ทันเวลา', '2037-08-10 00:00:00', late, student.id, 'ส่งช้า', '2037-08-12 00:00:01']);
    await pool.execute('INSERT INTO submissions (assignment_id, student_id, answer_text, file_path, original_name, submitted_at, grade, feedback, graded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [zero, student.id, 'คำตอบ', 'private.pdf', 'ชื่อ.pdf', '2037-08-12 00:00:00', 0, 'แก้ไข', '2037-08-14 00:00:00']);
    const result = await store.month('2037-08', student);
    expect(result.items.map(item => item.status)).toEqual(['missing', 'submitted', 'late', 'graded']);
    expect(result.items[0]?.submission).toBeNull();
    expect(result.items[2]?.submission?.is_late).toBe(true);
    expect(result.items[3]?.submission).toMatchObject({ student_id: student.id, grade: 0, feedback: 'แก้ไข', file_path: 'private.pdf', original_name: 'ชื่อ.pdf', graded_at: '2037-08-14T00:00:00.000Z' });
    expect(JSON.stringify(result)).not.toContain('คำตอบส่วนตัวของคนอื่น');
    for (const item of (await store.month('2037-08', teacher)).items) expect(item).toMatchObject({ status: null, submission: null });
  });

  it('guards current database role/activity and rejects malformed or out-of-range months', async () => {
    for (const month of ['1999-12', '2101-01', '2024-00', '2024-13', '2024-2', '2024-02-01', "2024-02' OR 1=1 --", '', '2024-02\n']) await expect(store.month(month, student)).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
    await expect(store.month('2024-02', admin)).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
    await expect(store.month('2024-02', { ...admin, role: 'student' })).rejects.toMatchObject({ status: 403 });
    await pool.execute('UPDATE users SET is_active = 0 WHERE id = ?', [student.id]);
    try { await expect(store.month('2024-02', student)).rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' }); }
    finally { await pool.execute('UPDATE users SET is_active = 1 WHERE id = ?', [student.id]); }
    await pool.execute('UPDATE users SET role = ? WHERE id = ?', ['admin', teacher.id]);
    try { await expect(store.month('2024-02', teacher)).rejects.toMatchObject({ status: 403 }); }
    finally { await pool.execute('UPDATE users SET role = ? WHERE id = ?', ['teacher', teacher.id]); }
    await expect(store.month('2024-02', { ...student, id: 4_000_000_000 })).rejects.toMatchObject({ status: 401 });
    expect((await store.month('2000-01', student)).items).toEqual([]);
    expect((await store.month('2100-12', student)).items).toEqual([]);
  });
});
