import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Bot } from 'grammy';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { loadConfig } from '../src/config.js';
import { createPool, createUserStore } from '../src/db.js';
import { createClassStore } from '../src/class-db.js';
import { createAssignmentStore } from '../src/assignment-db.js';
import { createTelegramStore } from '../src/telegram-db.js';
import { configureStudentBot, createTelegramSend } from '../src/bot/telegram.js';
import { createNotifications } from '../src/services/notify.js';
import { createApp } from '../src/app.js';
import { telegramWebhook } from '../src/routes/telegram.js';

describe.skipIf(process.env.RUN_DB_TESTS !== '1')('M4 HTTP → SQL → grammy simulated delivery', () => {
  let pool: Pool;
  let app: ReturnType<typeof createApp>;
  let classId: number;
  let taskId: number;
  let submissionId: number;
  let secret: string;
  const origin = 'http://localhost:3000';
  const webhookSecret = 'fabricated-webhook-secret-at-least-32-chars';
  const userIds: number[] = [];
  const messages: { chat_id: number; text: string }[] = [];
  const chats = Array.from({ length: 5 }, (_, i) => 8_000_000_000 + Math.floor(Math.random() * 1_000_000) * 10 + i);
  beforeAll(async () => {
    const config = loadConfig();
    if (config.DB_NAME !== 'student_tag_m1_test') throw new Error('Use isolated student_tag_m1_test');
    secret = config.JWT_SECRET;
    pool = createPool(config);
    for (let i = 0; i < 6; i++) {
      const [row] = await pool.execute<ResultSetHeader>('INSERT INTO users(role,name,email,password_hash) VALUES(?,?,?,?)', [i === 0 ? 'teacher' : 'student', `Telegram ทดสอบ ${i}`, `${randomUUID()}@m4.test`, 'unused']);
      userIds.push(row.insertId);
    }
    const users = createUserStore(pool);
    const classes = createClassStore(pool);
    const assignments = createAssignmentStore(pool);
    const store = createTelegramStore(pool);
    const teacher = (await users.findById(userIds[0]!))!;
    classId = await classes.create(teacher, { name: 'ห้องทดสอบ Telegram', section: '', join_code: randomUUID().slice(0, 15) });
    for (const student of userIds.slice(1)) await classes.addMember(classId, student);
    // Only this transformer sees fabricated test data; no network or Telegram credentials.
    const bot = new Bot('999:FABRICATED_TOKEN_ONLY_FOR_TESTS', { botInfo: { id: 999, is_bot: true, first_name: 'Test', username: 'student_tag_test_bot', can_join_groups: false, can_read_all_group_messages: false, supports_inline_queries: false, can_connect_to_business: false, has_main_web_app: false, has_topics_enabled: false, allows_users_to_create_topics: false, can_manage_bots: false, supports_join_request_queries: false } });
    bot.api.config.use(async (_prev, method, payload) => {
      if (method !== 'sendMessage') throw new Error('Unexpected Telegram method');
      const message = payload as { chat_id: number; text: string };
      if (message.chat_id === chats[4]) return { ok: false, error_code: 403, description: 'Forbidden: bot was blocked by the user' } as never;
      messages.push(message);
      return { ok: true, result: { message_id: messages.length, date: 0, chat: { id: message.chat_id, type: 'private', first_name: 'Test' }, text: message.text } } as never;
    });
    const send = createTelegramSend(bot, async () => {});
    configureStudentBot(bot, store, users, assignments, classes, 'https://school.example', send);
    const hooks = createNotifications(store, assignments, classes, send, 'https://school.example');
    app = createApp({ ...config, WEB_URL: origin }, users, classes, assignments, undefined, { store, hooks, configured: true, username: 'student_tag_test_bot', webhook: telegramWebhook(webhookSecret, update => bot.handleUpdate(update)) });
    for (const index of [1, 3, 4]) {
      const token = randomBytes(16).toString('hex');
      await store.issueLink(userIds[index + 1]!, token);
      await store.link(token, chats[index]!);
    }
    await store.mute(userIds[4]!, true);
  });
  afterAll(async () => {
    if (!pool) return;
    if (classId) {
      await pool.execute('DELETE s FROM submissions s JOIN assignments a ON a.id=s.assignment_id WHERE a.class_id=?', [classId]);
      await pool.execute('DELETE FROM assignments WHERE class_id=?', [classId]);
      await pool.execute('DELETE FROM announcements WHERE class_id=?', [classId]);
      await pool.execute('DELETE FROM class_members WHERE class_id=?', [classId]);
      await pool.execute('DELETE FROM classes WHERE id=?', [classId]);
    }
    for (const userId of userIds) {
      await pool.execute('DELETE FROM notification_log WHERE user_id=?', [userId]);
      await pool.execute('DELETE FROM telegram_link_tokens WHERE user_id=?', [userId]);
      await pool.execute('DELETE FROM users WHERE id=?', [userId]);
    }
    await pool.end();
  });
  function call(method: 'get' | 'post' | 'put' | 'patch', path: string, userId: number) {
    return request(app)[method](`/api${path}`).set('Origin', origin).set('Cookie', `session=${jwt.sign({}, secret, { subject: String(userId), issuer: 'student-tag', audience: 'student-tag-web', expiresIn: '15m' })}`);
  }
  async function logs(kind: string, refId: number, count: number) {
    let rows: RowDataPacket[] = [];
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      [rows] = await pool.execute<RowDataPacket[]>('SELECT user_id, status, error, payload FROM notification_log WHERE kind=? AND ref_id=?', [kind, refId]);
      if (rows.length >= count) break;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    expect(rows).toHaveLength(count);
    return rows;
  }
  it('links an authenticated student through the actual secret webhook and reports connected', async () => {
    const response = await call('post', '/telegram/link-token', userIds[1]!).send({});
    expect(response.status).toBe(201);
    const token = new URL(response.body.data.url).searchParams.get('start')!;
    const text = `/start ${token}`;
    const result = await request(app).post('/api/telegram/webhook').set('X-Telegram-Bot-Api-Secret-Token', webhookSecret).send({ update_id: 1, message: { message_id: 1, date: 0, chat: { id: chats[0], type: 'private', first_name: 'Test' }, from: { id: chats[0], is_bot: false, first_name: 'Test' }, text, entities: [{ type: 'bot_command', offset: 0, length: 6 }] } });
    expect(result.status).toBe(200);
    expect((await call('get', '/telegram/status', userIds[1]!)).body.data).toEqual({ configured: true, connected: true, muted: false });
    expect(messages.at(-1)?.text).toContain('สำเร็จ');
  });
  it('automatically sends new tasks and announcements while recording muted/unlinked/blocked users', async () => {
    const created = await call('post', `/classes/${classId}/assignments`, userIds[0]!).send({ title: 'งาน Telegram ใหม่' });
    expect(created.status).toBe(201);
    taskId = created.body.data.assignment.id;
    const outcomes = await logs('assignment', taskId, 5);
    expect(outcomes.map(r => r.status).sort()).toEqual(['failed', 'sent', 'sent', 'skipped', 'skipped']);
    const announcement = await call('post', `/classes/${classId}/announcements`, userIds[0]!).send({ body: 'ประกาศทดสอบ' });
    expect(announcement.status).toBe(201);
    await logs('announcement', announcement.body.data.announcement.id, 5);
    expect(messages.some(m => m.text.includes('ประกาศทดสอบ'))).toBe(true);
  });
  it('sends grade zero for text-only work, then reminds only missing students with accurate counts and ownership', async () => {
    const submitted = await call('put', `/assignments/${taskId}/submission`, userIds[1]!).send({ answer_text: 'คำตอบข้อความ ไม่มีไฟล์แนบ' });
    expect(submitted.status).toBe(200);
    submissionId = submitted.body.data.submission.id;
    expect((await call('patch', `/submissions/${submissionId}/grade`, userIds[0]!).send({ grade: 0, feedback: 'ลองใหม่' })).status).toBe(200);
    const scored = await logs('grade', submissionId, 1);
    expect(scored[0]).toMatchObject({ user_id: userIds[1], status: 'sent' });
    expect(scored[0]!.payload).toContain('0 / 100');
    expect((await call('post', `/assignments/${taskId}/remind`, 2).send({})).status).toBe(403);
    const reminded = await call('post', `/assignments/${taskId}/remind`, userIds[0]!).send({});
    expect(reminded.status).toBe(200);
    expect(reminded.body.data).toEqual({ total: 4, sent: 1, unlinked: 1, muted: 1, failed: 1, skipped: 0 });
    const reminders = await logs('reminder', taskId, 4);
    expect(reminders.some(r => r.user_id === userIds[1])).toBe(false);
  });
});
