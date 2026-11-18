import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import type { AdminStore, AdminUser } from '../src/admin.js';
import type { CalendarStore } from '../src/calendar.js';
import type { AppConfig, UserStore } from '../src/types.js';
const config: AppConfig = { WEB_URL: 'http://localhost:3000', JWT_SECRET: 'management-test-secret-at-least-32-characters', NODE_ENV: 'test' };
function setup() {
  const person: AdminUser = { id: 8, role: 'teacher', name: 'ครูใหม่', email: 'new@example.test', is_active: true, created_at: '2026-11-18T00:00:00Z' };
  const users: UserStore = { findByEmail: vi.fn(), create: vi.fn(), findById: vi.fn(async id => ({ id, role: id === 1 ? 'admin' as const : id === 2 ? 'teacher' as const : 'student' as const, name: 'Test', email: '', password_hash: '', is_active: 1 })) };
  const admin: AdminStore = { list: vi.fn(async (_actor, page) => ({ users: [person], page, page_size: 50, total: 1 })), createTeacher: vi.fn(async () => person), setActive: vi.fn(async () => ({ ...person, is_active: false })) };
  const calendar: CalendarStore = { month: vi.fn(async month => ({ month, timezone: 'Asia/Bangkok' as const, items: [] })) };
  const app = createApp(config, users, undefined, undefined, undefined, undefined, undefined, { admin, calendar });
  const cookie = (id: number) => `session=${jwt.sign({}, config.JWT_SECRET, { subject: String(id), issuer: 'student-tag', audience: 'student-tag-web', expiresIn: '15m' })}`;
  const call = (method: 'get' | 'post' | 'patch', path: string, userId?: number) => {
    const pending = request(app)[method](`/api${path}`).set('Origin', config.WEB_URL);
    if (userId) pending.set('Cookie', cookie(userId));
    return pending;
  };
  return { app, admin, calendar, call, cookie };
}
describe('M6 management and calendar HTTP', () => {
  it('requires active admin and CSRF for all management writes', async () => {
    const f = setup();
    expect((await f.call('get', '/admin/users')).status).toBe(401);
    expect((await f.call('get', '/admin/users', 2)).status).toBe(403);
    expect((await f.call('post', '/admin/users', 3).send({})).status).toBe(403);
    expect((await request(f.app).patch('/api/admin/users/8').set('Cookie', f.cookie(1)).send({ is_active: false })).status).toBe(403);
    expect((await f.call('get', '/admin/users?page=2', 1)).body.data.page).toBe(2);
    expect((await f.call('get', '/admin/users?page=0', 1)).status).toBe(400);
    expect((await f.call('get', '/admin/users?role=student', 1)).status).toBe(400);
  });
  it('creates only teachers with a real bcrypt hash, normalized email and safe response', async () => {
    const f = setup();
    const input = { name: ' ครูใหม่ ', email: ' New@Example.Test ', password: 'TeacherTest!2026' };
    expect((await f.call('post', '/admin/users', 1).send({ ...input, role: 'admin' })).status).toBe(400);
    expect((await f.call('post', '/admin/users', 1).send({ ...input, password: 'ก'.repeat(25) })).status).toBe(400);
    const response = await f.call('post', '/admin/users', 1).send(input);
    expect(response.status).toBe(201);
    const saved = vi.mocked(f.admin.createTeacher).mock.calls[0]![1];
    expect(saved.email).toBe('new@example.test');
    expect(saved.name).toBe('ครูใหม่');
    expect(await bcrypt.compare(input.password, saved.password_hash)).toBe(true);
    expect(JSON.stringify(response.body)).not.toContain('password');
    expect((await f.call('patch', '/admin/users/8', 1).send({ is_active: false })).body.data.user.is_active).toBe(false);
    expect((await f.call('patch', '/admin/users/8', 1).send({ is_active: 0 })).status).toBe(400);
  });
  it('validates calendar month and role before querying and strips private file paths', async () => {
    const f = setup();
    expect((await f.call('get', '/me/calendar?month=2026-11', 1)).status).toBe(403);
    for (const value of ['2026-13', '1999-12', '2101-01', '2026-1']) expect((await f.call('get', `/me/calendar?month=${value}`, 3)).status).toBe(400);
    expect((await f.call('get', '/me/calendar', 3)).status).toBe(400);
    const response = await f.call('get', '/me/calendar?month=2026-11', 3);
    expect(response.body.data).toEqual({ month: '2026-11', timezone: 'Asia/Bangkok', items: [] });
    expect(f.calendar.month).toHaveBeenCalledWith('2026-11', expect.objectContaining({ id: 3 }));
  });
});
