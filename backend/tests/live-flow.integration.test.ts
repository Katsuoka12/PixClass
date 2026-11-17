import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { loadConfig } from '../src/config.js';
import { createPool, createUserStore } from '../src/db.js';
import { createClassStore } from '../src/class-db.js';
import { createAssignmentStore } from '../src/assignment-db.js';
import { createLiveStore } from '../src/live-db.js';
import { createTelegramStore } from '../src/telegram-db.js';
import { createNotifications } from '../src/services/notify.js';
import { createLiveNotifications } from '../src/services/live-notify.js';
import { createApp } from '../src/app.js';
import type { TelegramButton } from '../src/telegram.js';

describe.skipIf(process.env.RUN_DB_TESTS !== '1')('M5 HTTP SQL invitation entry attendance flow', () => {
  let pool: Pool;
  let app: ReturnType<typeof createApp>;
  let classId: number;
  let liveId: number;
  let secret: string;
  let invitedToken: string;
  let ownToken: string;
  let firstJoined: string;
  const userIds: number[] = [];
  const origin = 'http://localhost:3000';
  const messages: { chat: number; text: string; buttons: TelegramButton[] }[] = [];
  const chatBase = 9_000_000_000 + Math.floor(Math.random() * 1_000_000);
  beforeAll(async () => {
    const config = loadConfig();
    if (config.DB_NAME !== 'student_tag_m1_test') throw new Error('Use isolated student_tag_m1_test');
    pool = createPool(config);
    secret = config.JWT_SECRET;
    for (let index = 0; index < 4; index++) {
      const [row] = await pool.execute<ResultSetHeader>('INSERT INTO users(role,name,email,password_hash,telegram_chat_id) VALUES(?,?,?,?,?)', [index === 0 ? 'teacher' : 'student', `Live ทดสอบ ${index}`, `${randomUUID()}@m5.test`, 'unused', index === 1 || index === 3 ? chatBase + index : null]);
      userIds.push(row.insertId);
    }
    const users = createUserStore(pool);
    const classes = createClassStore(pool);
    const assignments = createAssignmentStore(pool);
    const live = createLiveStore(pool);
    const telegram = createTelegramStore(pool);
    const notify = createNotifications(telegram, assignments, classes, async (chat, text, buttons, beforeSend) => { await beforeSend?.(); messages.push({ chat, text, buttons: buttons ?? [] }); }, 'https://school.example');
    classId = await classes.create((await users.findById(userIds[0]!))!, { name: 'Live HTTP flow', section: '', join_code: randomUUID().slice(0, 15) });
    for (const id of userIds.slice(1)) await classes.addMember(classId, id);
    app = createApp({ ...config, WEB_URL: origin }, users, classes, assignments, undefined, undefined, { store: live, domain: 'meet.jit.si', notifications: createLiveNotifications(live, telegram, users, notify.notify, 'https://school.example') });
  });
  afterAll(async () => {
    if (!pool) return;
    if (classId) {
      await pool.execute('DELETE a FROM live_attendance a JOIN live_sessions s ON s.id=a.live_session_id WHERE s.class_id=?', [classId]);
      await pool.execute('DELETE t FROM live_tokens t JOIN live_sessions s ON s.id=t.live_session_id WHERE s.class_id=?', [classId]);
      await pool.execute('DELETE FROM live_sessions WHERE class_id=?', [classId]);
      await pool.execute('DELETE FROM class_members WHERE class_id=?', [classId]);
      await pool.execute('DELETE FROM classes WHERE id=?', [classId]);
    }
    for (const id of userIds) {
      await pool.execute('DELETE FROM notification_log WHERE user_id=?', [id]);
      await pool.execute('DELETE FROM users WHERE id=?', [id]);
    }
    await pool.end();
  });
  function call(method: 'get' | 'post', path: string, id: number) {
    return request(app)[method](`/api${path}`).set('Origin', origin).set('Cookie', `session=${jwt.sign({}, secret, { subject: String(id), issuer: 'student-tag', audience: 'student-tag-web', expiresIn: '15m' })}`);
  }
  async function waitInvites() {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const [rows] = await pool.execute<RowDataPacket[]>('SELECT id FROM notification_log WHERE kind=? AND ref_id=?', ['live_invite', liveId]);
      if (rows.length === 3) return;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error('Live invitations did not finish');
  }
  it('starts a session and sends individual token URLs while hiding room names from listings and logs', async () => {
    const started = await call('post', `/classes/${classId}/live/start`, userIds[0]!).send({ title: 'คาบทดสอบ M5' });
    expect(started.status).toBe(201);
    liveId = started.body.data.session.id;
    expect(started.body.data.session).not.toHaveProperty('room_name');
    await waitInvites();
    expect(messages).toHaveLength(2);
    const invitation = messages.find(m => m.chat === chatBase + 1)!;
    invitedToken = new URL(invitation.buttons[0]!.url).searchParams.get('t')!;
    expect(invitedToken).toMatch(/^[a-f0-9]{64}$/);
    expect(invitation.buttons[0]!.url).not.toBe(messages.find(m => m.chat === chatBase + 3)!.buttons[0]!.url);
    const [logs] = await pool.execute<RowDataPacket[]>('SELECT payload FROM notification_log WHERE kind=? AND ref_id=?', ['live_invite', liveId]);
    expect(JSON.stringify(logs)).not.toContain(invitedToken);
    expect((await call('get', `/classes/${classId}/live`, userIds[1]!)).body.data.sessions[0]).not.toHaveProperty('room_name');
  });
  it('accepts invited entry and classroom entry without Telegram, with token ownership and stable first attendance', async () => {
    expect((await call('get', `/live/join?t=${invitedToken}`, userIds[2]!).set('X-Live-Join', '1')).status).toBe(400);
    const joined = await call('get', `/live/join?t=${invitedToken}`, userIds[1]!).set('X-Live-Join', '1');
    expect(joined.status).toBe(200);
    expect(joined.body.data.room_name).toMatch(/^st-[a-f0-9]{48}$/);
    expect(joined.body.data.display_name).toBe('Live ทดสอบ 1');
    const link = await call('post', `/live/${liveId}/link`, userIds[2]!).send({});
    expect(link.status).toBe(201);
    ownToken = new URL(link.body.data.url).searchParams.get('t')!;
    expect((await call('get', `/live/join?t=${ownToken}`, userIds[2]!).set('X-Live-Join', '1')).status).toBe(200);
    const roster = await call('get', `/live/${liveId}/attendance`, userIds[0]!);
    expect(roster.body.data.students.filter((s: { joined_at: string | null }) => s.joined_at)).toHaveLength(2);
    firstJoined = roster.body.data.students.find((s: { user_id: number }) => s.user_id === userIds[1]).joined_at;
    expect((await call('post', `/live/${liveId}/leave`, userIds[1]!).send({})).status).toBe(204);
    expect((await call('get', `/live/join?t=${invitedToken}`, userIds[1]!).set('X-Live-Join', '1')).status).toBe(200);
    expect((await call('get', `/live/${liveId}/attendance`, userIds[0]!)).body.data.students.find((s: { user_id: number }) => s.user_id === userIds[1])).toMatchObject({ joined_at: firstJoined, left_at: null });
  });
  it('ends the session, closes open records, rejects further joins and notifies only the absent student', async () => {
    expect((await call('post', `/live/${liveId}/end`, 2).send({})).status).toBe(403);
    expect((await call('get', `/live/${liveId}/attendance`, userIds[1]!)).status).toBe(403);
    const ended = await call('post', `/live/${liveId}/end`, userIds[0]!).send({});
    expect(ended.status).toBe(200);
    expect((await call('get', `/live/join?t=${ownToken}`, userIds[2]!).set('X-Live-Join', '1')).status).toBe(409);
    const roster = (await call('get', `/live/${liveId}/attendance`, userIds[0]!)).body.data;
    expect(roster.students.filter((s: { left_at: string | null }) => s.left_at === ended.body.data.session.ended_at)).toHaveLength(2);
    const before = messages.length;
    const reminded = await call('post', `/live/${liveId}/remind-absent`, userIds[0]!).send({});
    expect(reminded.status).toBe(200);
    expect(reminded.body.data).toEqual({ total: 1, sent: 1, unlinked: 0, muted: 0, failed: 0, skipped: 0 });
    expect(messages.slice(before).map(m => m.chat)).toEqual([chatBase + 3]);
    expect((await call('post', `/live/${liveId}/end`, userIds[0]!).send({})).body.data.session.ended_at).toBe(ended.body.data.session.ended_at);
  });
});
