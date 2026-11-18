import { createHash, randomUUID } from 'node:crypto';
import mysql, { type Pool, type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig, type Config } from '../src/config.js';
import { createPool } from '../src/db.js';
import { createReminderStore } from '../src/reminder-db.js';
import type { DueReminder, ReminderLease, ReminderStore } from '../src/reminders.js';

describe.skipIf(process.env.RUN_DB_TESTS !== '1')('MariaDB scheduled reminder repository', () => {
  const now = Date.parse('2035-01-01T00:00:00.000Z');
  const userIds: number[] = [];
  const roomIds: number[] = [];
  const leases: ReminderLease[] = [];
  let config: Config;
  let pool: Pool;
  let jobPool: Pool;
  let otherPool: Pool;
  let store: ReminderStore;
  let contender: ReminderStore;
  const due = (seconds: number) => new Date(now + seconds * 1000);

  beforeAll(async () => {
    config = loadConfig();
    if (config.DB_NAME !== 'student_tag_m1_test') throw new Error('Use the isolated student_tag_m1_test database');
    pool = createPool(config);
    const options = { host: config.DB_HOST, port: config.DB_PORT, database: config.DB_NAME, user: config.DB_USER, password: config.DB_PASS, charset: 'utf8mb4', timezone: 'Z', connectionLimit: 1 };
    jobPool = mysql.createPool(options);
    otherPool = mysql.createPool(options);
    // Freeze only these dedicated test connections; production SQL still uses UTC_TIMESTAMP().
    await jobPool.execute('SET timestamp = ?', [now / 1000]);
    await otherPool.execute('SET timestamp = ?', [now / 1000]);
    store = createReminderStore(jobPool);
    contender = createReminderStore(otherPool);
  });
  afterAll(async () => {
    for (const lease of leases) await lease.release();
    if (!pool) return;
    for (const id of userIds) await pool.execute('DELETE FROM notification_log WHERE user_id = ?', [id]);
    for (const id of roomIds) {
      await pool.execute('DELETE s FROM submissions s JOIN assignments a ON a.id = s.assignment_id WHERE a.class_id = ?', [id]);
      await pool.execute('DELETE FROM assignments WHERE class_id = ?', [id]);
      await pool.execute('DELETE FROM class_members WHERE class_id = ?', [id]);
      await pool.execute('DELETE FROM classes WHERE id = ?', [id]);
    }
    for (const id of userIds) await pool.execute('DELETE FROM users WHERE id = ?', [id]);
    await Promise.all([pool.end(), jobPool.end(), otherPool.end()]);
  });
  async function acquire(source = store) {
    const lease = await source.acquire();
    expect(lease).not.toBeNull();
    leases.push(lease!);
    return lease!;
  }
  async function user(role: 'teacher' | 'student') {
    const [result] = await pool.execute<ResultSetHeader>('INSERT INTO users (role,name,email,password_hash) VALUES (?,?,?,?)', [role, 'Reminder fixture', `${randomUUID()}@reminders.test`, 'unused-test-hash']);
    userIds.push(result.insertId);
    return result.insertId;
  }
  async function fixture(seconds = 3600) {
    const teacher = await user('teacher');
    const student = await user('student');
    const [room] = await pool.execute<ResultSetHeader>('INSERT INTO classes (teacher_id,name,join_code) VALUES (?,?,?)', [teacher, 'เตือนงาน', randomUUID().slice(0, 20)]);
    roomIds.push(room.insertId);
    await pool.execute('INSERT INTO class_members (class_id,user_id) VALUES (?,?)', [room.insertId, student]);
    const [assignment] = await pool.execute<ResultSetHeader>('INSERT INTO assignments (class_id,title,description,due_at) VALUES (?,?,?,?)', [room.insertId, 'งานที่กำลังครบกำหนด', '', due(seconds)]);
    const item: DueReminder = { assignment_id: assignment.insertId, class_id: room.insertId, class_name: 'เตือนงาน', title: 'งานที่กำลังครบกำหนด', due_at: due(seconds).toISOString(), user_id: student, window: seconds <= 10800 ? '3h' : '24h' };
    return { teacher, student, classId: room.insertId, assignmentId: assignment.insertId, item };
  }

  it('selects exact future 3h/24h boundaries and excludes overdue, undated and >24h work', async () => {
    const values = [-1, 0, 1, 10800, 10801, 86400, 86401];
    const fixtures = [];
    for (const value of values) fixtures.push(await fixture(value));
    const undated = await fixture();
    await pool.execute('UPDATE assignments SET due_at = NULL WHERE id = ?', [undated.assignmentId]);
    const lease = await acquire();
    try {
      const ids = [...fixtures.map(f => f.assignmentId), undated.assignmentId];
      const items = (await lease.candidates()).filter(item => ids.includes(item.assignment_id));
      expect(items.map(item => ({ id: item.assignment_id, window: item.window }))).toEqual([
        { id: fixtures[2]!.assignmentId, window: '3h' }, { id: fixtures[3]!.assignmentId, window: '3h' },
        { id: fixtures[4]!.assignmentId, window: '24h' }, { id: fixtures[5]!.assignmentId, window: '24h' },
      ]);
      expect(items[0]?.due_at).toBe('2035-01-01T00:00:01.000Z');
    } finally { await lease.release(); }
  });

  it('holds one database-scoped advisory lock across pools and releases idempotently', async () => {
    const lease = await acquire();
    try { expect(await contender.acquire()).toBeNull(); }
    finally { await lease.release(); await lease.release(); }
    const second = await acquire(contender);
    await second.release();
    const third = await acquire();
    await third.release();
  });

  it('reserves durably once, completes the same row and deduplicates all statuses across runs', async () => {
    const fixtures = [await fixture(), await fixture(), await fixture()];
    const statuses = ['sent', 'failed', 'skipped'] as const;
    const lease = await acquire();
    try {
      for (const [index, f] of fixtures.entries()) {
        const id = await lease.claim(f.item);
        expect(id).toBeTypeOf('number');
        const [reserved] = await pool.execute<RowDataPacket[]>('SELECT status,error FROM notification_log WHERE id = ?', [id]);
        expect(reserved[0]).toMatchObject({ status: 'skipped', error: 'DUE_RESERVED' });
        expect(await lease.claim(f.item)).toBeNull();
        await lease.complete(id!, { userId: f.student, kind: 'due_3h', refId: f.assignmentId, text: 'ข้อความเตือน', status: statuses[index]!, error: index === 1 ? 'TELEGRAM_403' : null });
        const [saved] = await pool.execute<RowDataPacket[]>('SELECT payload,status,error FROM notification_log WHERE id = ?', [id]);
        expect(saved[0]).toMatchObject({ payload: 'ข้อความเตือน', status: statuses[index] });
      }
    } finally { await lease.release(); }
    const again = await acquire(contender);
    try {
      const ids = fixtures.map(f => f.assignmentId);
      expect((await again.candidates()).filter(item => ids.includes(item.assignment_id))).toEqual([]);
      for (const f of fixtures) expect(await again.claim(f.item)).toBeNull();
    } finally { await again.release(); }
  });

  it('deduplicates a reserved crash outcome and remembers each window despite due edits', async () => {
    const f = await fixture(14400);
    const lease = await acquire();
    try {
      expect(await lease.claim(f.item)).toBeTypeOf('number');
      await pool.execute('UPDATE assignments SET due_at = ? WHERE id = ?', [due(18000), f.assignmentId]);
      expect(await lease.claim({ ...f.item, due_at: due(18000).toISOString() })).toBeNull();
      await pool.execute('UPDATE assignments SET due_at = ? WHERE id = ?', [due(3600), f.assignmentId]);
      const near = { ...f.item, due_at: due(3600).toISOString(), window: '3h' as const };
      expect(await lease.claim(near)).toBeTypeOf('number');
    } finally { await lease.release(); }
    const again = await acquire();
    try { expect((await again.candidates()).filter(item => item.assignment_id === f.assignmentId)).toEqual([]); }
    finally { await again.release(); }
  });

  it('serializes overlapping claims on one lease and refuses another reservation identity', async () => {
    const f = await fixture();
    const lease = await acquire();
    try {
      const claimed = await Promise.all([lease.claim(f.item), lease.claim(f.item)]);
      expect(claimed.filter(id => id !== null)).toHaveLength(1);
      const id = claimed.find(value => value !== null)!;
      await expect(lease.complete(id, { userId: f.teacher, kind: 'due_3h', refId: f.assignmentId, text: 'wrong owner', status: 'sent', error: null })).rejects.toThrow('does not match');
      await lease.complete(id, { userId: f.student, kind: 'due_3h', refId: f.assignmentId, text: 'failed', status: 'failed', error: 'Unsafe raw transport secret' });
      const [rows] = await pool.execute<RowDataPacket[]>('SELECT status,error FROM notification_log WHERE id = ?', [id]);
      expect(rows[0]).toMatchObject({ status: 'failed', error: 'REMINDER_RESULT_ERROR' });
    } finally { await lease.release(); }
  });

  it('rechecks exact due, window, submission, enrollment, active user and archived classroom', async () => {
    const lease = await acquire();
    try {
      const changed = await fixture();
      expect(await lease.eligible(changed.item)).toBe(true);
      await pool.execute('UPDATE assignments SET due_at = ? WHERE id = ?', [due(7200), changed.assignmentId]);
      expect(await lease.eligible(changed.item)).toBe(false);
      expect(await lease.claim(changed.item)).toBeNull();
      expect(await lease.eligible({ ...changed.item, due_at: due(7200).toISOString(), window: '24h' })).toBe(false);
      const submitted = await fixture();
      await pool.execute('INSERT INTO submissions (assignment_id,student_id,answer_text) VALUES (?,?,?)', [submitted.assignmentId, submitted.student, 'ส่งแล้ว']);
      const removed = await fixture();
      await pool.execute('DELETE FROM class_members WHERE class_id = ? AND user_id = ?', [removed.classId, removed.student]);
      const inactive = await fixture();
      await pool.execute('UPDATE users SET is_active = ? WHERE id = ?', [0, inactive.student]);
      const archived = await fixture();
      await pool.execute('UPDATE classes SET archived = ? WHERE id = ?', [1, archived.classId]);
      for (const f of [submitted, removed, inactive, archived]) {
        expect(await lease.eligible(f.item)).toBe(false);
        expect(await lease.claim(f.item)).toBeNull();
      }
      const excluded = [changed, submitted, removed, inactive, archived].map(f => f.assignmentId);
      expect((await lease.candidates()).filter(item => excluded.includes(item.assignment_id)).map(item => item.assignment_id)).toEqual([changed.assignmentId]);
    } finally { await lease.release(); }
  });

  it('stops using a lease after its dedicated connection is lost and never reacquires it implicitly', async () => {
    const f = await fixture();
    const lease = await acquire();
    const lockName = `student-tag:due:${createHash('sha256').update(config.DB_NAME).digest('hex').slice(0, 48)}`;
    const [rows] = await pool.execute<(RowDataPacket & { owner: number })[]>('SELECT IS_USED_LOCK(?) AS owner', [lockName]);
    expect(rows[0]?.owner).toBeTypeOf('number');
    await pool.execute('KILL CONNECTION ?', [rows[0]!.owner]);
    expect(await lease.eligible(f.item)).toBe(false);
    await expect(lease.candidates()).rejects.toThrow();
    await lease.release();
    const recovered = await acquire(contender);
    try {
      expect(await lease.eligible(f.item)).toBe(false);
      expect(await recovered.eligible(f.item)).toBe(true);
    } finally { await recovered.release(); }
  });
});
