import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';
import type { AppConfig, UserStore } from '../src/types.js';
import type { LiveIntegration, LiveSession } from '../src/live.js';

const config: AppConfig = { WEB_URL: 'http://localhost:3000', JWT_SECRET: 'live-http-test-secret-longer-than-32-characters', NODE_ENV: 'test' };
const session: LiveSession = { id: 10, class_id: 1, class_name: 'ห้องทดสอบ', class_archived: false, title: 'เรียนสด', scheduled_at: null, started_at: '2026-11-17T00:00:00.000Z', ended_at: null, created_by: 2 };
function setup() {
  const users: UserStore = { findByEmail: vi.fn(), create: vi.fn(), findById: vi.fn(async id => ({ id, role: id === 2 ? 'teacher' as const : 'student' as const, name: 'ผู้ใช้', email: '', password_hash: '', is_active: 1 })) };
  const live: LiveIntegration = { domain: 'meet.jit.si', store: { list: vi.fn(async () => [session]), get: vi.fn(async () => session), start: vi.fn(async () => session), issueToken: vi.fn(async () => ({ token: 'a'.repeat(64), expires_at: '2026-11-17T02:00:00.000Z' })), join: vi.fn(async () => ({ session, room_name: `st-${'b'.repeat(48)}`, display_name: 'ผู้ใช้' })), leave: vi.fn(), end: vi.fn(async () => ({ ...session, ended_at: '2026-11-17T01:00:00.000Z' })), attendance: vi.fn(async () => ({ session, students: [] })), isAbsent: vi.fn() }, notifications: { invite: vi.fn(async () => {}), remindAbsent: vi.fn(async () => ({ total: 1, sent: 1, unlinked: 0, muted: 0, failed: 0, skipped: 0 })) } };
  const app = createApp(config, users, undefined, undefined, undefined, undefined, live);
  const cookie = (id: number) => `session=${jwt.sign({}, config.JWT_SECRET, { subject: String(id), issuer: 'student-tag', audience: 'student-tag-web', expiresIn: '15m' })}`;
  const call = (method: 'get' | 'post', path: string, id?: number) => {
    const pending = request(app)[method](`/api${path}`).set('Origin', config.WEB_URL);
    if (id) pending.set('Cookie', cookie(id));
    return pending;
  };
  return { live, call, app, cookie };
}
describe('M5 live HTTP validation and guards', () => {
  it('requires auth/teacher/CSRF, validates strict input, and dispatches invitations after start', async () => {
    const f = setup();
    expect((await f.call('get', '/classes/1/live')).status).toBe(401);
    expect((await f.call('post', '/classes/1/live/start', 3).send({ title: 'คาบ' })).status).toBe(403);
    expect((await request(f.app).post('/api/classes/1/live/start').set('Cookie', f.cookie(2)).send({ title: 'คาบ' })).status).toBe(403);
    expect((await f.call('post', '/classes/1/live/start', 2).send({ title: 'คาบ', room_name: 'hijacked' })).status).toBe(400);
    expect((await f.call('post', '/classes/1/live/start', 2).send({ title: 'คาบ' })).status).toBe(201);
    expect(f.live.notifications.invite).toHaveBeenCalled();
  });
  it('issues only current-user links and does not expose room names from list', async () => {
    const f = setup();
    const response = await f.call('get', '/classes/1/live', 3);
    expect(response.body.data.sessions).toEqual([session]);
    const link = await f.call('post', '/live/10/link', 3).send({});
    expect(link.status).toBe(201);
    expect(link.body.data.url).toBe(`http://localhost:3000/live/join?t=${'a'.repeat(64)}`);
    expect((await f.call('post', '/live/10/link', 3).send({ user_id: 4 })).status).toBe(400);
  });
  it('rejects navigation/prefetch/cross-site join and accepts explicit authenticated token entry', async () => {
    const f = setup();
    const path = `/live/join?t=${'a'.repeat(64)}`;
    expect((await f.call('get', path, 3)).status).toBe(403);
    expect((await f.call('get', path, 3).set('X-Live-Join', '1').set('Sec-Fetch-Site', 'cross-site')).status).toBe(403);
    expect((await f.call('get', '/live/join?t=bad', 3).set('X-Live-Join', '1')).status).toBe(400);
    const joined = await f.call('get', path, 3).set('X-Live-Join', '1');
    expect(joined.status).toBe(200);
    expect(joined.body.data.domain).toBe('meet.jit.si');
    expect(f.live.store.join).toHaveBeenCalledWith('a'.repeat(64), expect.objectContaining({ id: 3 }));
  });
  it('keeps teacher attendance/end/reminder private and accepts authenticated beacon JSON leave', async () => {
    const f = setup();
    expect((await f.call('get', '/live/10/attendance', 3)).status).toBe(403);
    expect((await f.call('post', '/live/10/end', 3).send({})).status).toBe(403);
    expect((await f.call('post', '/live/10/remind-absent', 3).send({})).status).toBe(403);
    expect((await f.call('post', '/live/10/leave', 3).send({})).status).toBe(204);
    expect((await f.call('get', '/live/10/attendance', 2)).body.data.students).toEqual([]);
    expect((await f.call('post', '/live/10/end', 2).send({})).body.data.session.ended_at).not.toBeNull();
    expect((await f.call('post', '/live/10/remind-absent', 2).send({})).body.data.sent).toBe(1);
    expect((await f.call('post', '/live/10/remind-absent', 2).send({})).status).toBe(429);
  });
});
