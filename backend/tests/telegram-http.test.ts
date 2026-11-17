import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';
import { telegramWebhook } from '../src/routes/telegram.js';
import type { TelegramIntegration } from '../src/telegram.js';
import type { UserStore, AppConfig } from '../src/types.js';

const config: AppConfig = { WEB_URL: 'http://localhost:3000', JWT_SECRET: 'test-secret-telegram-at-least-32-characters', NODE_ENV: 'test' };
function setup(enabled = true) {
  const users: UserStore = { findByEmail: vi.fn(), create: vi.fn(), findById: vi.fn(async id => ({ id, name: 'Test', role: id === 2 ? 'teacher' as const : 'student' as const, email: 'test@example.test', password_hash: '', is_active: 1 })) };
  const integration: TelegramIntegration = { configured: enabled, username: 'student_tag_test_bot', store: { account: vi.fn(async id => ({ id, name: 'Test', role: 'student' as const, chat_id: null, muted: false, is_active: 1 })), byChat: vi.fn(), issueLink: vi.fn(async () => '2026-11-17T10:00:00.000Z'), link: vi.fn(), mute: vi.fn(), log: vi.fn(), recipients: vi.fn(), eligible: vi.fn() }, hooks: { assignment: vi.fn(), announcement: vi.fn(), grade: vi.fn(), remind: vi.fn(async () => ({ total: 4, sent: 1, unlinked: 1, muted: 1, failed: 1, skipped: 0 })) } };
  const update = vi.fn(async () => {});
  integration.webhook = telegramWebhook('test-webhook-secret-at-least-32-characters', update);
  const app = createApp(config, users, undefined, undefined, undefined, integration);
  const cookie = (id: number) => `session=${jwt.sign({}, config.JWT_SECRET, { subject: String(id), issuer: 'student-tag', audience: 'student-tag-web', expiresIn: '15m' })}`;
  return { app, integration, update, cookie };
}
describe('M4 authenticated HTTP and webhook boundary', () => {
  it('requires cookie/CSRF and returns only public Telegram status', async () => {
    const f = setup();
    expect((await request(f.app).get('/api/telegram/status')).status).toBe(401);
    const status = await request(f.app).get('/api/telegram/status').set('Cookie', f.cookie(3));
    expect(status.body).toEqual({ data: { configured: true, connected: false, muted: false } });
    expect((await request(f.app).post('/api/telegram/link-token').set('Cookie', f.cookie(3)).send({})).status).toBe(403);
    const link = await request(f.app).post('/api/telegram/link-token').set('Origin', config.WEB_URL).set('Cookie', f.cookie(3)).send({});
    expect(link.status).toBe(201);
    expect(link.body.data.url).toMatch(/^https:\/\/t.me\/student_tag_test_bot\?start=[a-f0-9]{32}$/);
    expect(f.integration.store.issueLink).toHaveBeenCalledWith(3, expect.stringMatching(/^[a-f0-9]{32}$/));
  });
  it('rejects disabled linking and invalid input', async () => {
    const f = setup(false);
    expect((await request(f.app).post('/api/telegram/link-token').set('Origin', config.WEB_URL).set('Cookie', f.cookie(3)).send({})).status).toBe(503);
    expect((await request(f.app).get('/api/telegram/status?userId=4').set('Cookie', f.cookie(3))).status).toBe(400);
  });
  it('allows teacher reminders, blocks students and rate-limits repeated teacher requests', async () => {
    const f = setup();
    const call = (id: number) => request(f.app).post('/api/assignments/10/remind').set('Origin', config.WEB_URL).set('Cookie', f.cookie(id)).send({});
    expect((await call(3)).status).toBe(403);
    const sent = await call(2);
    expect(sent.status).toBe(200);
    expect(sent.body.data).toEqual({ total: 4, sent: 1, unlinked: 1, muted: 1, failed: 1, skipped: 0 });
    expect((await call(2)).status).toBe(429);
  });
  it('authenticates webhook independently of browser CSRF and validates payload before processing', async () => {
    const f = setup();
    const send = (secret: string) => request(f.app).post('/api/telegram/webhook').set('X-Telegram-Bot-Api-Secret-Token', secret);
    expect((await send('wrong').send({ update_id: 1 })).status).toBe(403);
    expect((await send('test-webhook-secret-at-least-32-characters').send({ update_id: 'wrong' })).status).toBe(400);
    expect((await send('test-webhook-secret-at-least-32-characters').send({ update_id: 1 })).status).toBe(200);
    expect(f.update).toHaveBeenCalledTimes(1);
    expect((await request(f.app).post('/api/auth/logout').set('X-Telegram-Bot-Api-Secret-Token', 'test-webhook-secret-at-least-32-characters').send({})).status).toBe(403);
  });
});
