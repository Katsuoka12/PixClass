import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { loadConfig } from '../src/config.js';
import { createPool } from '../src/db.js';
import { createTelegramStore } from '../src/telegram-db.js';
import type { TelegramStore } from '../src/telegram.js';

describe.skipIf(process.env.RUN_DB_TESTS !== '1')('MariaDB Telegram repository', () => {
  let pool: Pool;
  let store: TelegramStore;
  const users: number[] = [];
  const rooms: number[] = [];
  const token = () => randomBytes(16).toString('hex');
  let nextChat = 7_000_000_000 + Math.floor(Math.random() * 100_000_000);
  const chat = () => ++nextChat;

  beforeAll(() => {
    const config = loadConfig();
    if (config.DB_NAME !== 'student_tag_m1_test') throw new Error('DB tests require DB_NAME=student_tag_m1_test');
    pool = createPool(config);
    store = createTelegramStore(pool);
  });
  afterAll(async () => {
    if (!pool) return;
    for (const id of rooms) {
      await pool.execute('DELETE s FROM submissions s JOIN assignments a ON a.id = s.assignment_id WHERE a.class_id = ?', [id]);
      await pool.execute('DELETE FROM assignments WHERE class_id = ?', [id]);
      await pool.execute('DELETE FROM class_members WHERE class_id = ?', [id]);
      await pool.execute('DELETE FROM classes WHERE id = ?', [id]);
    }
    for (const id of users) {
      await pool.execute('DELETE FROM notification_log WHERE user_id = ?', [id]);
      await pool.execute('DELETE FROM telegram_link_tokens WHERE user_id = ?', [id]);
      await pool.execute('DELETE FROM users WHERE id = ?', [id]);
    }
    await pool.end();
  });
  async function user(role: 'student' | 'teacher' = 'student') {
    const [saved] = await pool.execute<ResultSetHeader>('INSERT INTO users (role,name,email,password_hash) VALUES (?,?,?,?)', [role, 'ผู้ใช้ทดสอบ Telegram', `${randomUUID()}@telegram.test`, 'unused-test-hash']);
    users.push(saved.insertId);
    return saved.insertId;
  }
  async function fixture() {
    const teacher = await user('teacher');
    const student = await user();
    const peer = await user();
    const [room] = await pool.execute<ResultSetHeader>('INSERT INTO classes (teacher_id,name,join_code) VALUES (?,?,?)', [teacher, 'ห้อง Telegram', randomUUID().slice(0, 20)]);
    rooms.push(room.insertId);
    await pool.execute('INSERT INTO class_members (class_id,user_id) VALUES (?,?),(?,?)', [room.insertId, student, room.insertId, peer]);
    const [assignment] = await pool.execute<ResultSetHeader>('INSERT INTO assignments (class_id,title,description) VALUES (?,?,?)', [room.insertId, 'งาน Telegram', '']);
    return { teacher, student, peer, classId: room.insertId, assignmentId: assignment.insertId };
  }

  it('issues a UTC 15-minute link, invalidates its predecessor and consumes exactly once', async () => {
    const id = await user();
    const previous = token();
    const current = token();
    await store.issueLink(id, previous);
    const expires = await store.issueLink(id, current);
    expect(Date.parse(expires) - Date.now()).toBeGreaterThan(890_000);
    expect(Date.parse(expires) - Date.now()).toBeLessThanOrEqual(900_000);
    await expect(store.link(previous, chat())).rejects.toMatchObject({ code: 'INVALID_LINK' });
    const chatId = chat();
    await store.link(current, chatId);
    await expect(store.link(current, chatId)).rejects.toMatchObject({ code: 'INVALID_LINK' });
    expect(await store.account(id)).toMatchObject({ id, chat_id: chatId, muted: false });
    expect(await store.byChat(chatId)).toMatchObject({ id, role: 'student' });
  });

  it('rejects expired, unknown, malformed and inactive-user tokens without linking', async () => {
    const id = await user();
    const value = token();
    await store.issueLink(id, value);
    await pool.execute('UPDATE telegram_link_tokens SET expires_at = UTC_TIMESTAMP() - INTERVAL 1 SECOND WHERE token = ?', [value]);
    await expect(store.link(value, chat())).rejects.toMatchObject({ code: 'INVALID_LINK' });
    await expect(store.link(token(), chat())).rejects.toMatchObject({ code: 'INVALID_LINK' });
    await expect(store.link('invalid', chat())).rejects.toMatchObject({ code: 'INVALID_LINK' });
    const fresh = token();
    await store.issueLink(id, fresh);
    await pool.execute('UPDATE users SET is_active = ? WHERE id = ?', [0, id]);
    await expect(store.link(fresh, chat())).rejects.toMatchObject({ code: 'INVALID_LINK' });
    expect((await store.account(id))?.chat_id).toBeNull();
    await expect(store.issueLink(id, token())).rejects.toMatchObject({ code: 'INVALID_LINK' });
  });

  it('prevents chat/account reassignment but permits a fresh link to the same chat', async () => {
    const first = await user();
    const second = await user();
    const chatId = chat();
    const a = token(); const b = token(); const c = token();
    await store.issueLink(first, a); await store.link(a, chatId);
    await store.issueLink(second, b);
    await expect(store.link(b, chatId)).rejects.toMatchObject({ code: 'TELEGRAM_ALREADY_LINKED', status: 409 });
    await store.issueLink(first, c);
    await expect(store.link(c, chat())).rejects.toMatchObject({ code: 'TELEGRAM_ALREADY_LINKED' });
    await store.link(c, chatId);
    expect((await store.account(second))?.chat_id).toBeNull();
  });

  it('serializes concurrent token consumption and duplicate-chat claims', async () => {
    const first = await user(); const second = await user();
    const a = token(); const b = token();
    await store.issueLink(first, a); await store.issueLink(second, b);
    const chatId = chat();
    const outcomes = await Promise.allSettled([store.link(a, chatId), store.link(b, chatId)]);
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.find(result => result.status === 'rejected')).toMatchObject({ reason: { code: 'TELEGRAM_ALREADY_LINKED' } });
    const id = await user(); const value = token();
    await store.issueLink(id, value);
    const same = chat();
    const consumed = await Promise.allSettled([store.link(value, same), store.link(value, same)]);
    expect(consumed.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(consumed.find(result => result.status === 'rejected')).toMatchObject({ reason: { code: 'INVALID_LINK' } });
  });

  it('persists mute and hides disabled accounts from chat authentication', async () => {
    const id = await user(); const value = token(); const chatId = chat();
    await store.issueLink(id, value); await store.link(value, chatId);
    await store.mute(id, true);
    expect((await store.byChat(chatId))?.muted).toBe(true);
    await store.mute(id, false);
    expect((await store.account(id))?.muted).toBe(false);
    await pool.execute('UPDATE users SET is_active = ? WHERE id = ?', [0, id]);
    expect(await store.byChat(chatId)).toBeNull();
    expect(await store.account(4294967295)).toBeNull();
  });

  it('selects active members and missing submissions, then rechecks removal/archive/current submission', async () => {
    const f = await fixture();
    expect(await store.recipients(f.classId)).toEqual([f.student, f.peer]);
    expect(await store.eligible(f.student, f.classId, f.assignmentId)).toBe(true);
    await pool.execute('INSERT INTO submissions (assignment_id,student_id,answer_text) VALUES (?,?,?)', [f.assignmentId, f.student, 'คำตอบ']);
    expect(await store.recipients(f.classId, f.assignmentId)).toEqual([f.peer]);
    expect(await store.eligible(f.student, f.classId, f.assignmentId)).toBe(false);
    expect(await store.eligible(f.teacher, f.classId)).toBe(false);
    expect(await store.recipients(f.classId, 4294967295)).toEqual([]);
    await pool.execute('DELETE FROM class_members WHERE class_id = ? AND user_id = ?', [f.classId, f.peer]);
    expect(await store.eligible(f.peer, f.classId)).toBe(false);
    await pool.execute('UPDATE users SET is_active = ? WHERE id = ?', [0, f.student]);
    expect(await store.recipients(f.classId)).toEqual([]);
    await pool.execute('UPDATE users SET is_active = ? WHERE id = ?', [1, f.student]);
    await pool.execute('UPDATE classes SET archived = ? WHERE id = ?', [1, f.classId]);
    expect(await store.recipients(f.classId)).toEqual([]);
    expect(await store.eligible(f.student, f.classId)).toBe(false);
  });

  it('stores notification outcomes and literal payloads with prepared SQL', async () => {
    const id = await user();
    const text = "ประกาศ '); DROP TABLE users; --";
    for (const status of ['sent', 'failed', 'skipped'] as const) {
      await store.log({ userId: id, kind: 'assignment', refId: null, text, status, error: status === 'failed' ? 'TELEGRAM_403' : null });
    }
    const [rows] = await pool.execute<RowDataPacket[]>('SELECT payload,status,error FROM notification_log WHERE user_id = ? ORDER BY id', [id]);
    expect(rows.map(row => row.status)).toEqual(['sent', 'failed', 'skipped']);
    expect(rows.every(row => row.payload === text)).toBe(true);
    expect(rows[1]?.error).toBe('TELEGRAM_403');
  });
});
