import { randomBytes, randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { loadConfig } from '../src/config.js';
import { createPool, createUserStore } from '../src/db.js';
import { createClassStore } from '../src/class-db.js';
import { createAssignmentStore } from '../src/assignment-db.js';
import { createAdminStore } from '../src/admin-db.js';
import { createCalendarStore } from '../src/calendar-db.js';
import { createReminderStore } from '../src/reminder-db.js';
import { createTelegramStore } from '../src/telegram-db.js';
import { createNotifications } from '../src/services/notify.js';
import { runDueReminders } from '../src/jobs/reminders.js';
import { createApp } from '../src/app.js';
import type { ReminderStore } from '../src/reminders.js';

describe.skipIf(process.env.RUN_DB_TESTS !== '1')('M6 HTTP SQL scheduler flow', () => {
  let pool: Pool;
  let app: ReturnType<typeof createApp>;
  let classId: number;
  let calendarId: number;
  let secret: string;
  let month: string;
  let teacherId: number;
  const users: number[] = [];
  const assignmentIds: number[] = [];
  const email = `${randomUUID()}@m6-teacher.test`;
  const password = 'M6TeacherTest!2026';
  const origin = 'http://localhost:3000';
  const chatBase = 12_000_000_000 + Math.floor(Math.random() * 1_000_000);
  let scoped: ReminderStore;
  let notify: ReturnType<typeof createNotifications>['notify'];
  const delivered: number[] = [];
  let attempts = 0;
  let beforeSendMutation: (() => Promise<void>) | null = null;
  beforeAll(async () => {
    const config = loadConfig();
    if (config.DB_NAME !== 'student_tag_m1_test') throw new Error('Use isolated student_tag_m1_test');
    pool = createPool(config);
    secret = config.JWT_SECRET;
    for (let i = 0; i < 6; i++) {
      const [row] = await pool.execute<ResultSetHeader>('INSERT INTO users(role,name,email,password_hash,telegram_chat_id,telegram_muted) VALUES(?,?,?,?,?,?)', [i === 0 ? 'teacher' : 'student', `M6 ผู้ใช้ ${i}`, `${randomUUID()}@m6-flow.test`, 'unused', [1, 3, 4].includes(i) ? chatBase + i : null, i === 3 ? 1 : 0]);
      users.push(row.insertId);
    }
    const [room] = await pool.execute<ResultSetHeader>('INSERT INTO classes(teacher_id,name,join_code) VALUES(?,?,?)', [users[0]!, 'M6 flow', randomUUID().slice(0, 15)]);
    classId = room.insertId;
    for (const id of users.slice(1)) await pool.execute('INSERT INTO class_members(class_id,user_id) VALUES(?,?)', [classId, id]);
    for (const hours of [6, 2]) {
      const [task] = await pool.execute<ResultSetHeader>('INSERT INTO assignments(class_id,title,description,due_at) VALUES(?,?,?,UTC_TIMESTAMP()+INTERVAL ? HOUR)', [classId, `Due ${hours}`, '', hours]);
      assignmentIds.push(task.insertId);
      await pool.execute('INSERT INTO submissions(assignment_id,student_id,answer_text) VALUES(?,?,?)', [task.insertId, users[5]!, 'Already submitted']);
    }
    const due = new Date(Date.now() + 6 * 60 * 60_000);
    month = new Date(due.getTime() + 7 * 60 * 60_000).toISOString().slice(0, 7);
    const [calendar] = await pool.execute<ResultSetHeader>('INSERT INTO assignments(class_id,title,description,due_at) VALUES(?,?,?,?)', [classId, 'Calendar private grade', '', due]);
    calendarId = calendar.insertId;
    await pool.execute('INSERT INTO submissions(assignment_id,student_id,answer_text,file_path,original_name,grade,graded_at) VALUES(?,?,?,?,?,?,UTC_TIMESTAMP()),(?,?,?,?,?,?,UTC_TIMESTAMP())', [calendarId, users[1]!, 'Own answer', `${randomBytes(32).toString('hex')}.pdf`, 'answer.pdf', 0, calendarId, users[5]!, 'Other private answer', null, null, 99]);
    const userStore = createUserStore(pool);
    const classStore = createClassStore(pool);
    const assignments = createAssignmentStore(pool);
    app = createApp({ ...config, WEB_URL: origin }, userStore, classStore, assignments, undefined, undefined, undefined, { admin: createAdminStore(pool), calendar: createCalendarStore(pool) });
    notify = createNotifications(createTelegramStore(pool), assignments, classStore, async (chat, _text, _buttons, guard) => {
      const mutation = beforeSendMutation;
      beforeSendMutation = null;
      await mutation?.();
      await guard?.(); attempts++;
      if (chat === chatBase + 4) throw new Error('Simulated blocked Telegram chat');
      delivered.push(chat);
    }, 'https://school.example').notify;
    const actual = createReminderStore(pool);
    // Scope only generated test tasks; the production worker remains global.
    scoped = { async acquire() {
      const until = Date.now() + 5000;
      while (Date.now() < until) {
        const lease = await actual.acquire();
        if (lease) return { ...lease, candidates: async () => (await lease.candidates()).filter(item => assignmentIds.includes(item.assignment_id)) };
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      throw new Error('Could not obtain isolated reminder test lease');
    } };
  });
  afterAll(async () => {
    if (!pool) return;
    for (const id of users) await pool.execute('DELETE FROM notification_log WHERE user_id=?', [id]);
    if (classId) {
      await pool.execute('DELETE s FROM submissions s JOIN assignments a ON a.id=s.assignment_id WHERE a.class_id=?', [classId]);
      await pool.execute('DELETE FROM assignments WHERE class_id=?', [classId]);
      await pool.execute('DELETE FROM class_members WHERE class_id=?', [classId]);
      await pool.execute('DELETE FROM classes WHERE id=?', [classId]);
    }
    for (const id of users) await pool.execute('DELETE FROM users WHERE id=?', [id]);
    if (teacherId) await pool.execute('DELETE FROM users WHERE id=?', [teacherId]);
    await pool.end();
  });
  function call(method: 'get' | 'post' | 'patch', path: string, id: number) {
    return request(app)[method](`/api${path}`).set('Origin', origin).set('Cookie', `session=${jwt.sign({}, secret, { subject: String(id), issuer: 'student-tag', audience: 'student-tag-web', expiresIn: '15m' })}`);
  }
  it('creates a teacher with real bcrypt login, immediately disables its cookie, and protects admin accounts', async () => {
    const created = await call('post', '/admin/users', 1).send({ name: 'ครู M6', email, password });
    expect(created.status).toBe(201);
    teacherId = created.body.data.user.id;
    expect(created.body.data.user.role).toBe('teacher');
    const login = await request(app).post('/api/auth/login').set('Origin', origin).send({ email, password });
    expect(login.status).toBe(200);
    const cookie = login.headers['set-cookie']![0]!.split(';')[0]!;
    expect((await call('patch', `/admin/users/${teacherId}`, 1).send({ is_active: false })).status).toBe(200);
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(401);
    expect((await request(app).post('/api/auth/login').set('Origin', origin).send({ email, password })).status).toBe(401);
    expect((await call('patch', `/admin/users/${teacherId}`, 1).send({ is_active: true })).status).toBe(200);
    expect((await call('patch', '/admin/users/1', 1).send({ is_active: false })).body.error.code).toBe('ADMIN_PROTECTED');
    expect((await call('get', '/admin/users', users[1]!)).status).toBe(403);
    const list = await call('get', '/admin/users', 1);
    expect(JSON.stringify(list.body)).not.toMatch(/password_hash|telegram_chat_id|token/);
  });
  it('returns only the student own calendar result with grade zero and no disk paths', async () => {
    const response = await call('get', `/me/calendar?month=${month}`, users[1]!);
    expect(response.status).toBe(200);
    const item = response.body.data.items.find((row: { assignment: { id: number } }) => row.assignment.id === calendarId);
    expect(item.status).toBe('graded');
    expect(item.submission.grade).toBe(0);
    expect(item.submission.file_url).toMatch(/^\/api\/submissions\/\d+\/file$/);
    expect(JSON.stringify(response.body)).not.toMatch(/file_path|Other private answer/);
    const teacher = await call('get', `/me/calendar?month=${month}`, users[0]!);
    expect(teacher.body.data.items.every((row: { submission: unknown; status: unknown }) => row.submission === null && row.status === null)).toBe(true);
  });
  it('runs both due windows once despite concurrent/repeated runs and records all outcomes on original reservations', async () => {
    await Promise.all([runDueReminders(scoped, notify, 'https://school.example'), runDueReminders(scoped, notify, 'https://school.example')]);
    expect(delivered).toEqual([chatBase + 1, chatBase + 1]);
    expect(attempts).toBe(4);
    await runDueReminders(scoped, notify, 'https://school.example');
    expect(attempts).toBe(4);
    const [rows] = await pool.execute<RowDataPacket[]>('SELECT kind,status,error,user_id FROM notification_log WHERE ref_id IN (?,?) AND kind IN (?,?)', [...assignmentIds, 'due_24h', 'due_3h']);
    expect(rows).toHaveLength(8);
    expect(rows.filter(row => row.status === 'sent')).toHaveLength(2);
    expect(rows.filter(row => row.status === 'failed')).toHaveLength(2);
    expect(rows.filter(row => row.status === 'skipped')).toHaveLength(4);
    expect(rows.some(row => row.error === 'DUE_RESERVED' || row.user_id === users[5]!)).toBe(false);
  });
  it('skips a student suspended after queueing and preserves the durable attempt', async () => {
    const [task] = await pool.execute<ResultSetHeader>('INSERT INTO assignments(class_id,title,description,due_at) VALUES(?,?,?,UTC_TIMESTAMP()+INTERVAL 6 HOUR)', [classId, 'Suspend while queued', '']);
    assignmentIds.push(task.insertId);
    await pool.execute('INSERT INTO submissions(assignment_id,student_id,answer_text) VALUES(?,?,?)', [task.insertId, users[5]!, 'Submitted']);
    beforeSendMutation = async () => { expect((await call('patch', `/admin/users/${users[1]!}`, 1).send({ is_active: false })).status).toBe(200); };
    const before = delivered.length;
    await runDueReminders(scoped, notify, 'https://school.example');
    expect(delivered).toHaveLength(before);
    const [rows] = await pool.execute<RowDataPacket[]>('SELECT status,error FROM notification_log WHERE ref_id=? AND user_id=? AND kind=?', [task.insertId, users[1]!, 'due_24h']);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'skipped', error: 'SKIPPED' });
    await call('patch', `/admin/users/${users[1]!}`, 1).send({ is_active: true });
    await runDueReminders(scoped, notify, 'https://school.example');
    expect(delivered).toHaveLength(before);
  });
  it('does not resend after delivery succeeds but updating its notification log fails', async () => {
    const [task] = await pool.execute<ResultSetHeader>('INSERT INTO assignments(class_id,title,description,due_at) VALUES(?,?,?,UTC_TIMESTAMP()+INTERVAL 6 HOUR)', [classId, 'Lost result update', '']);
    assignmentIds.push(task.insertId);
    for (const user of users.slice(2)) await pool.execute('INSERT INTO submissions(assignment_id,student_id,answer_text) VALUES(?,?,?)', [task.insertId, user, 'Submitted']);
    const failing: ReminderStore = { async acquire() {
      const lease = await scoped.acquire();
      return lease ? { ...lease, complete: async (logId, record) => { if (record.refId === task.insertId) throw new Error('Simulated log write failure'); await lease.complete(logId, record); } } : null;
    } };
    const before = delivered.length;
    await runDueReminders(failing, notify, 'https://school.example');
    expect(delivered).toHaveLength(before + 1);
    await runDueReminders(scoped, notify, 'https://school.example');
    expect(delivered).toHaveLength(before + 1);
    const [rows] = await pool.execute<RowDataPacket[]>('SELECT status,error FROM notification_log WHERE ref_id=? AND user_id=? AND kind=?', [task.insertId, users[1]!, 'due_24h']);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'skipped', error: 'DUE_RESERVED' });
  });
});
