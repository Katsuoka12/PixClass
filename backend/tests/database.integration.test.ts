import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { loadConfig } from '../src/config.js';
import { createPool, createUserStore } from '../src/db.js';
import { createApp } from '../src/app.js';

// Requires a separately imported, disposable test database. Never seed a real DB here.
describe.skipIf(process.env.RUN_DB_TESTS !== '1')('MariaDB authentication integration', () => {
  let pool: Pool;
  let app: ReturnType<typeof createApp>;
  const origin = 'http://localhost:3000';
  const email = `test-${randomUUID()}@example.test`;

  beforeAll(() => {
    const config = loadConfig();
    if (config.DB_NAME !== 'student_tag_m1_test') throw new Error('DB tests require DB_NAME=student_tag_m1_test');
    pool = createPool(config);
    app = createApp(config, createUserStore(pool));
  });

  afterAll(async () => {
    if (pool) {
      await pool.execute('DELETE FROM users WHERE email = ?', [email]);
      await pool.end();
    }
  });

  it.each([
    ['admin', 'admin@student-tag.test'],
    ['teacher', 'teacher@student-tag.test'],
    ['student', 'student1@student-tag.test'],
  ])('authenticates seeded %s using real bcrypt and SQL', async (role, account) => {
    const response = await request(app).post('/api/auth/login').set('Origin', origin)
      .send({ email: account, password: 'StudyTag!2026' });
    expect(response.status).toBe(200);
    expect(response.body.data.user.role).toBe(role);
    const cookie = response.headers['set-cookie']![0]!.split(';')[0]!;
    expect((await request(app).get(`/api/${role}/overview`).set('Cookie', cookie)).status).toBe(200);
    expect((await request(app).get(`/api/${role === 'admin' ? 'student' : 'admin'}/overview`).set('Cookie', cookie)).status).toBe(403);
  });

  it('persists registration, rejects duplicates and disables an existing session immediately', async () => {
    const input = { name: 'นักเรียนทดสอบ', email, password: 'StudyTag!2026' };
    const response = await request(app).post('/api/auth/register').set('Origin', origin).send(input);
    expect(response.status).toBe(201);
    expect(response.body.data.user.name).toBe('นักเรียนทดสอบ');
    expect((await request(app).post('/api/auth/register').set('Origin', origin).send(input)).status).toBe(409);
    const [saved] = await pool.execute<RowDataPacket[]>('SELECT role, password_hash FROM users WHERE email = ?', [email]);
    expect(saved[0]!.role).toBe('student');
    expect(saved[0]!.password_hash).not.toBe(input.password);
    await pool.execute('UPDATE users SET is_active = ? WHERE email = ?', [0, email]);
    const cookie = response.headers['set-cookie']![0]!.split(';')[0]!;
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(401);
  });

  it('imports UTF-8 seed relationships and rejects orphan classroom membership', async () => {
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT c.name, COUNT(cm.id) AS member_count FROM classes c JOIN class_members cm ON cm.class_id = c.id WHERE c.id = ? GROUP BY c.id, c.name', [1],
    );
    expect(rows[0]).toMatchObject({ name: 'วิทยาศาสตร์รอบตัว', member_count: 4 });
    await expect(pool.execute('INSERT INTO class_members (class_id, user_id) VALUES (?, ?)', [999999, 3]))
      .rejects.toMatchObject({ code: 'ER_NO_REFERENCED_ROW_2' });
  });
});
