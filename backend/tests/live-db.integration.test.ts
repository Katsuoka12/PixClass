import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { loadConfig } from '../src/config.js';
import { createPool, createUserStore } from '../src/db.js';
import { createLiveStore } from '../src/live-db.js';
import type { LiveStore } from '../src/live.js';
import type { User } from '../src/types.js';

describe.skipIf(process.env.RUN_DB_TESTS !== '1')('MariaDB Live Class repository', () => {
  let pool: Pool;
  let store: LiveStore;
  const users: number[] = [];
  const classes: number[] = [];
  beforeAll(() => {
    const config = loadConfig();
    if (config.DB_NAME !== 'student_tag_m1_test') throw new Error('Use disposable student_tag_m1_test');
    pool = createPool(config);
    store = createLiveStore(pool);
  });
  afterAll(async () => {
    if (!pool) return;
    for (const classId of classes) {
      await pool.execute('DELETE a FROM live_attendance a JOIN live_sessions s ON s.id=a.live_session_id WHERE s.class_id=?', [classId]);
      await pool.execute('DELETE t FROM live_tokens t JOIN live_sessions s ON s.id=t.live_session_id WHERE s.class_id=?', [classId]);
      await pool.execute('DELETE FROM live_sessions WHERE class_id=?', [classId]);
      await pool.execute('DELETE FROM class_members WHERE class_id=?', [classId]);
      await pool.execute('DELETE FROM classes WHERE id=?', [classId]);
    }
    for (const id of users) await pool.execute('DELETE FROM users WHERE id=?', [id]);
    await pool.end();
  });
  async function user(role: User['role'] = 'student'): Promise<User> {
    const [result] = await pool.execute<ResultSetHeader>('INSERT INTO users(role,name,email,password_hash) VALUES(?,?,?,?)', [role, `Live ${role}`, `${randomUUID()}@live.test`, 'unused']);
    users.push(result.insertId);
    return (await createUserStore(pool).findById(result.insertId))!;
  }
  async function fixture() {
    const teacher = await user('teacher');
    const student = await user();
    const peer = await user();
    const [room] = await pool.execute<ResultSetHeader>('INSERT INTO classes(teacher_id,name,join_code) VALUES(?,?,?)', [teacher.id, 'ห้อง Live', randomUUID().slice(0, 20)]);
    classes.push(room.insertId);
    await pool.execute('INSERT INTO class_members(class_id,user_id) VALUES(?,?),(?,?)', [room.insertId, student.id, room.insertId, peer.id]);
    return { teacher, student, peer, classId: room.insertId };
  }
  it('starts exactly one active session under concurrent requests and hides room names', async () => {
    const f = await fixture();
    const results = await Promise.allSettled([store.start(f.classId, f.teacher, 'คาบแรก'), store.start(f.classId, f.teacher, 'คาบซ้อน')]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(r => r.status === 'rejected')).toMatchObject({ reason: { code: 'LIVE_ALREADY_ACTIVE' } });
    const sessions = await store.list(f.classId, f.student);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.started_at).toMatch(/Z$/);
    expect(sessions[0]).not.toHaveProperty('room_name');
    const [rows] = await pool.execute<RowDataPacket[]>('SELECT room_name FROM live_sessions WHERE class_id=?', [f.classId]);
    expect(rows[0]!.room_name).toMatch(/^st-[a-f0-9]{48}$/);
  });
  it('authorizes owner/member/teacher-only views and rejects inactive current users', async () => {
    const f = await fixture();
    const outsider = await user();
    const otherTeacher = await user('teacher');
    const admin = await user('admin');
    for (const denied of [f.student, outsider, otherTeacher, admin]) await expect(store.start(f.classId, denied, 'ไม่อนุญาต')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const session = await store.start(f.classId, f.teacher, 'คาบสิทธิ์');
    await expect(store.get(session.id, outsider)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(store.get(session.id, f.student, true)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(store.attendance(session.id, f.student)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await pool.execute('UPDATE users SET is_active=? WHERE id=?', [0, f.student.id]);
    await expect(store.issueToken(session.id, f.student)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });
  it('issues scoped two-hour tokens, checks owner/expiry/malformed and allows re-entry without duplicate first join', async () => {
    const f = await fixture();
    const session = await store.start(f.classId, f.teacher, 'คาบ Token');
    const link = await store.issueToken(session.id, f.student);
    expect(link.token).toMatch(/^[a-f0-9]{64}$/);
    expect(Date.parse(link.expires_at) - Date.now()).toBeGreaterThan(7_190_000);
    expect(Date.parse(link.expires_at) - Date.now()).toBeLessThanOrEqual(7_200_000);
    await expect(store.join(link.token, f.peer)).rejects.toMatchObject({ code: 'INVALID_LIVE_TOKEN' });
    await expect(store.join('invalid', f.student)).rejects.toMatchObject({ code: 'INVALID_LIVE_TOKEN' });
    const joined = await store.join(link.token, f.student);
    expect(joined.room_name).toMatch(/^st-/);
    expect(joined.display_name).toBe(f.student.name);
    const first = (await store.attendance(session.id, f.teacher)).students.find(p => p.user_id === f.student.id)!;
    expect(first.joined_at).toMatch(/Z$/);
    expect(first.left_at).toBeNull();
    await store.leave(session.id, f.student);
    expect((await store.attendance(session.id, f.teacher)).students.find(p => p.user_id === f.student.id)!.left_at).toMatch(/Z$/);
    await store.join(link.token, f.student);
    const rejoined = (await store.attendance(session.id, f.teacher)).students.find(p => p.user_id === f.student.id)!;
    expect(rejoined).toMatchObject({ joined_at: first.joined_at, left_at: null });
    await pool.execute('UPDATE live_tokens SET expires_at=UTC_TIMESTAMP()-INTERVAL 1 SECOND WHERE token=?', [link.token]);
    await expect(store.join(link.token, f.student)).rejects.toMatchObject({ code: 'INVALID_LIVE_TOKEN' });
  });
  it('ends idempotently, closes attendance, blocks new links/joins and identifies only current absent students', async () => {
    const f = await fixture();
    const session = await store.start(f.classId, f.teacher, 'คาบเช็คชื่อ');
    const link = await store.issueToken(session.id, f.student);
    await store.join(link.token, f.student);
    const teacherLink = await store.issueToken(session.id, f.teacher);
    await store.join(teacherLink.token, f.teacher);
    expect(await store.isAbsent(session.id, f.peer.id)).toBe(false);
    await expect(store.end(session.id, f.peer)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const ended = await store.end(session.id, f.teacher);
    expect(ended.ended_at).toMatch(/Z$/);
    expect((await store.end(session.id, f.teacher)).ended_at).toBe(ended.ended_at);
    expect(await store.isAbsent(session.id, f.peer.id)).toBe(true);
    expect(await store.isAbsent(session.id, f.student.id)).toBe(false);
    const report = await store.attendance(session.id, f.teacher);
    expect(report.students).toHaveLength(2);
    expect(report.students.find(p => p.user_id === f.student.id)!.left_at).toBe(ended.ended_at);
    expect(report.students.find(p => p.user_id === f.peer.id)!.joined_at).toBeNull();
    await expect(store.join(link.token, f.student)).rejects.toMatchObject({ code: 'LIVE_ENDED' });
    await expect(store.issueToken(session.id, f.student)).rejects.toMatchObject({ code: 'LIVE_ENDED' });
    await store.leave(session.id, f.student);
    await pool.execute('DELETE FROM class_members WHERE class_id=? AND user_id=?', [f.classId, f.peer.id]);
    expect(await store.isAbsent(session.id, f.peer.id)).toBe(false);
    expect((await store.attendance(session.id, f.teacher)).students).toHaveLength(1);
    await expect(store.start(f.classId, f.teacher, 'คาบถัดไป')).resolves.toMatchObject({ title: 'คาบถัดไป' });
  });
  it('makes archived classes read-only while allowing owner end and member leave cleanup', async () => {
    const f = await fixture();
    const session = await store.start(f.classId, f.teacher, 'คาบเก็บห้อง');
    const link = await store.issueToken(session.id, f.student);
    await store.join(link.token, f.student);
    await pool.execute('UPDATE classes SET archived=? WHERE id=?', [1, f.classId]);
    expect((await store.list(f.classId, f.student))[0]!.class_archived).toBe(true);
    await expect(store.start(f.classId, f.teacher, 'คาบใหม่')).rejects.toMatchObject({ code: 'CLASS_ARCHIVED' });
    await expect(store.issueToken(session.id, f.student)).rejects.toMatchObject({ code: 'CLASS_ARCHIVED' });
    await expect(store.join(link.token, f.student)).rejects.toMatchObject({ code: 'CLASS_ARCHIVED' });
    await store.leave(session.id, f.student);
    await expect(store.end(session.id, f.teacher)).resolves.toMatchObject({ class_archived: true });
    expect(await store.isAbsent(session.id, f.peer.id)).toBe(false);
  });
  it('rechecks removed membership and rejects unknown sessions safely', async () => {
    const f = await fixture();
    const session = await store.start(f.classId, f.teacher, 'คาบสมาชิก');
    const link = await store.issueToken(session.id, f.student);
    await pool.execute('DELETE FROM class_members WHERE class_id=? AND user_id=?', [f.classId, f.student.id]);
    await expect(store.join(link.token, f.student)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(store.leave(session.id, f.student)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(store.get(4294967295, f.teacher)).rejects.toMatchObject({ code: 'LIVE_NOT_FOUND' });
    await expect(store.join('a'.repeat(64), f.peer)).rejects.toMatchObject({ code: 'INVALID_LIVE_TOKEN' });
  });
  it.each(['expiry', 'membership'] as const)('rechecks %s after waiting for the classroom lock', async condition => {
    const f = await fixture();
    const session = await store.start(f.classId, f.teacher, 'คาบรอล็อก');
    const link = await store.issueToken(session.id, f.student);
    const blocker = await pool.getConnection();
    let pending: ReturnType<LiveStore['join']> | undefined;
    try {
      await blocker.beginTransaction();
      await blocker.execute('SELECT id FROM classes WHERE id=? FOR UPDATE', [f.classId]);
      pending = store.join(link.token, f.student);
      const outcome = pending.then(value => ({ value, error: null }), (error: unknown) => ({ value: null, error }));
      let observed: { error: unknown } | undefined;
      void outcome.then(value => { observed = value; });
      const deadline = Date.now() + 5000;
      let waiting = false;
      while (Date.now() < deadline && !observed) {
        const [sessions] = await pool.execute<RowDataPacket[]>('SELECT ID FROM information_schema.PROCESSLIST WHERE DB=? AND INFO=?', ['student_tag_m1_test', 'SELECT id,teacher_id,archived FROM classes WHERE id=? FOR UPDATE']);
        if (sessions.length) { waiting = true; break; }
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      expect(waiting).toBe(true);
      if (condition === 'expiry') await blocker.execute('UPDATE live_tokens SET expires_at=UTC_TIMESTAMP()-INTERVAL 1 SECOND WHERE token=?', [link.token]);
      else await blocker.execute('DELETE FROM class_members WHERE class_id=? AND user_id=?', [f.classId, f.student.id]);
      await blocker.commit();
      expect((await outcome).error).toMatchObject({ code: condition === 'expiry' ? 'INVALID_LIVE_TOKEN' : 'FORBIDDEN' });
    } finally {
      await blocker.rollback();
      blocker.release();
      if (pending) await Promise.allSettled([pending]);
    }
  }, 15_000);
  it('serializes concurrent join and end without leaving open attendance', async () => {
    const f = await fixture();
    const session = await store.start(f.classId, f.teacher, 'คาบจบพร้อมเข้า');
    const link = await store.issueToken(session.id, f.student);
    const [joined, ended] = await Promise.allSettled([store.join(link.token, f.student), store.end(session.id, f.teacher)]);
    expect(ended.status).toBe('fulfilled');
    if (joined.status === 'rejected') expect(joined.reason).toMatchObject({ code: 'LIVE_ENDED' });
    const report = await store.attendance(session.id, f.teacher);
    expect(report.session.ended_at).not.toBeNull();
    const student = report.students.find(p => p.user_id === f.student.id)!;
    if (student.joined_at) expect(student.left_at).not.toBeNull();
    await expect(store.join(link.token, f.student)).rejects.toMatchObject({ code: 'LIVE_ENDED' });
  });
});
