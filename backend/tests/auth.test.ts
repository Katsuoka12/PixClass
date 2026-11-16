import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';
import type { AppConfig, Role, User, UserStore } from '../src/types.js';

const config: AppConfig = {
  JWT_SECRET: 'test-secret-with-more-than-thirty-two-characters',
  WEB_URL: 'http://localhost:3000',
  NODE_ENV: 'test',
};
const password = 'StudyTag!2026';
const hash = await bcrypt.hash(password, 4);
let users: User[];
let store: UserStore;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  users = (['admin', 'teacher', 'student'] as const).map((role, index) => ({
    id: index + 1, role, name: role, email: `${role}@example.test`,
    password_hash: hash, is_active: 1,
  }));
  store = {
    async findByEmail(email) { return users.find(user => user.email === email); },
    async findById(id) { return users.find(user => user.id === id); },
    async create(input) {
      if (users.some(user => user.email === input.email)) throw { code: 'ER_DUP_ENTRY' };
      const id = users.length + 1;
      users.push({ ...input, id, role: 'student', is_active: 1 });
      return id;
    },
  };
  app = createApp(config, store);
});

function login(role: Role = 'student') {
  return request(app).post('/api/auth/login').set('Origin', config.WEB_URL)
    .send({ email: `${role}@example.test`, password });
}

function cookie(response: { headers: Record<string, unknown> }): string {
  const cookies = response.headers['set-cookie'] as string[];
  return cookies[0]!.split(';')[0]!;
}

describe('authentication HTTP contract', () => {
  it.each(['admin', 'teacher', 'student'] as const)('logs in %s with a private cookie and restores the session', async role => {
    const response = await login(role);
    expect(response.status).toBe(200);
    expect(response.body.data.user.role).toBe(role);
    expect(response.body.data.user.password_hash).toBeUndefined();
    expect(response.headers['set-cookie']![0]!).toMatch(/HttpOnly/);
    expect(response.headers['set-cookie']![0]!).toMatch(/SameSite=Lax/);
    const me = await request(app).get('/api/auth/me').set('Cookie', cookie(response));
    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe(`${role}@example.test`);
  });

  it('registers a student with a hashed password and normalizes email', async () => {
    const response = await request(app).post('/api/auth/register').set('Origin', config.WEB_URL)
      .send({ name: ' นักเรียนใหม่ ', email: 'NEW@example.test', password });
    expect(response.status).toBe(201);
    expect(response.body.data.user).toMatchObject({ name: 'นักเรียนใหม่', email: 'new@example.test', role: 'student' });
    const saved = users.find(user => user.email === 'new@example.test')!;
    expect(saved.password_hash).not.toBe(password);
    expect(await bcrypt.compare(password, saved.password_hash)).toBe(true);
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie(response))).status).toBe(200);
  });

  it.each([
    { name: 'Test', email: 'a@example.test', password, role: 'admin' },
    { name: '', email: 'bad', password: 'short' },
    { name: 'Test', email: 'a@example.test', password: 'ก'.repeat(25) },
    { name: 'Test', email: 'a@example.test', password: 'a'.repeat(73) },
  ])('rejects invalid registration including role injection and bcrypt byte truncation', async body => {
    const response = await request(app).post('/api/auth/register').set('Origin', config.WEB_URL).send(body);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(users).toHaveLength(3);
  });

  it('returns conflict for duplicate email including an insert race', async () => {
    const response = await request(app).post('/api/auth/register').set('Origin', config.WEB_URL)
      .send({ name: 'Test', email: 'student@example.test', password });
    expect(response.status).toBe(409);
    store.findByEmail = async () => undefined;
    const raced = await request(app).post('/api/auth/register').set('Origin', config.WEB_URL)
      .send({ name: 'Test', email: 'student@example.test', password });
    expect(raced.status).toBe(409);
    expect(raced.body.error.code).toBe('EMAIL_EXISTS');
  });

  it('rejects wrong credentials without revealing whether an account exists', async () => {
    const wrong = await request(app).post('/api/auth/login').set('Origin', config.WEB_URL)
      .send({ email: 'student@example.test', password: 'incorrect-password' });
    const absent = await request(app).post('/api/auth/login').set('Origin', config.WEB_URL)
      .send({ email: 'absent@example.test', password });
    expect(wrong.status).toBe(401);
    expect(absent.body).toEqual(wrong.body);
  });

  it('rejects missing, forged and expired session cookies', async () => {
    const expired = jwt.sign({ sub: '3' }, config.JWT_SECRET, { expiresIn: -1, issuer: 'student-tag', audience: 'student-tag-web' });
    for (const value of ['', 'session=forged', `session=${expired}`]) {
      const response = await request(app).get('/api/auth/me').set('Cookie', value);
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHENTICATED');
    }
  });

  it('checks suspension on every request and refuses suspended login', async () => {
    const response = await login();
    users[2]!.is_active = 0;
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie(response))).status).toBe(401);
    expect((await login()).status).toBe(401);
  });

  it('enforces every role combination and reads current roles from the database', async () => {
    for (const role of ['admin', 'teacher', 'student'] as const) {
      const response = await login(role);
      for (const target of ['admin', 'teacher', 'student']) {
        const result = await request(app).get(`/api/${target}/overview`).set('Cookie', cookie(response));
        expect(result.status).toBe(role === target ? 200 : 403);
      }
    }
    const teacher = await login('teacher');
    users[1]!.role = 'student';
    expect((await request(app).get('/api/teacher/overview').set('Cookie', cookie(teacher))).status).toBe(403);
  });

  it('clears the same cookie at logout', async () => {
    const response = await login();
    const logout = await request(app).post('/api/auth/logout').set('Origin', config.WEB_URL).set('Cookie', cookie(response)).send({});
    expect(logout.status).toBe(204);
    expect(logout.headers['set-cookie']![0]!).toMatch(/session=;/);
    expect(logout.headers['set-cookie']![0]!).toMatch(/Path=\//);
  });

  it('uses Secure cookies when the configured web origin is HTTPS', async () => {
    app = createApp({ ...config, WEB_URL: 'https://school.example' }, store);
    const response = await request(app).post('/api/auth/login').set('Origin', 'https://school.example')
      .send({ email: 'student@example.test', password });
    expect(response.headers['set-cookie']![0]!).toMatch(/; Secure/);
  });

  it.each([undefined, 'https://attacker.example', 'null'])('blocks mutations from origin %s', async origin => {
    let pending = request(app).post('/api/auth/login');
    if (origin) pending = pending.set('Origin', origin);
    const response = await pending.send({ email: 'student@example.test', password });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CSRF_REJECTED');
  });

  it('blocks cross-site Fetch Metadata even with an allowed origin', async () => {
    const response = await request(app).post('/api/auth/logout').set('Origin', config.WEB_URL)
      .set('Sec-Fetch-Site', 'cross-site').send({});
    expect(response.status).toBe(403);
  });

  it('limits repeated login attempts', async () => {
    for (let index = 0; index < 10; index++) await login();
    const response = await login();
    expect(response.status).toBe(429);
    expect(response.body.error.code).toBe('RATE_LIMITED');
  });

  it('keeps proxy clients in independent rate limit buckets', async () => {
    for (let index = 0; index < 10; index++) {
      await request(app).post('/api/auth/login').set('Origin', config.WEB_URL)
        .set('X-Forwarded-For', '198.51.100.10').send({ email: 'student@example.test', password });
    }
    const other = await request(app).post('/api/auth/login').set('Origin', config.WEB_URL)
      .set('X-Forwarded-For', '198.51.100.11').send({ email: 'student@example.test', password });
    expect(other.status).toBe(200);
  });

  it('returns safe errors for invalid JSON, unknown routes and unavailable database', async () => {
    const malformed = await request(app).post('/api/auth/login').set('Origin', config.WEB_URL).type('json').send('{');
    expect(malformed.status).toBe(400);
    const absent = await request(app).get('/api/missing');
    expect(absent.status).toBe(404);
    expect(absent.body.error.code).toBe('NOT_FOUND');
    store.findByEmail = async () => { throw new Error('secret database credentials'); };
    const response = await login();
    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(response.body)).not.toContain('secret');
  });
});
