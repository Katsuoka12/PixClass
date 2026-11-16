import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { loadConfig } from '../src/config.js';
import { createPool, createUserStore } from '../src/db.js';
import { createClassStore } from '../src/class-db.js';
import { createApp } from '../src/app.js';

describe.skipIf(process.env.RUN_DB_TESTS !== '1')('MariaDB classroom integration', () => {
  let pool: Pool;
  let app: ReturnType<typeof createApp>;
  let secret: string;
  let secondTeacher: number;
  const roomIds: number[] = [];
  const origin = 'http://localhost:3000';
  const teacherEmail = `teacher-${randomUUID()}@example.test`;
  beforeAll(async () => {
    const config = loadConfig();
    if (config.DB_NAME !== 'student_tag_m1_test') throw new Error('DB tests require DB_NAME=student_tag_m1_test');
    pool = createPool(config);
    secret = config.JWT_SECRET;
    const [result] = await pool.execute<ResultSetHeader>(
      'INSERT INTO users (role, name, email, password_hash) VALUES (?, ?, ?, ?)', ['teacher', 'Other teacher', teacherEmail, 'unused-test-hash'],
    );
    secondTeacher = result.insertId;
    app = createApp(config, createUserStore(pool), createClassStore(pool));
  });
  afterAll(async () => {
    if (!pool) return;
    for (const id of roomIds) {
      await pool.execute('DELETE FROM announcements WHERE class_id = ?', [id]);
      await pool.execute('DELETE FROM class_members WHERE class_id = ?', [id]);
      await pool.execute('DELETE FROM classes WHERE id = ?', [id]);
    }
    await pool.execute('DELETE FROM users WHERE email = ?', [teacherEmail]);
    await pool.end();
  });
  function call(method: 'get' | 'post' | 'patch' | 'delete', path: string, userId: number) {
    return request(app)[method](`/api${path}`).set('Origin', origin).set('Cookie', `session=${jwt.sign({}, secret, {
      subject: String(userId), issuer: 'student-tag', audience: 'student-tag-web', expiresIn: '15m',
    })}`);
  }
  async function createRoom(teacher = 2) {
    const response = await call('post', '/classes', teacher).send({ name: 'ห้องทดสอบ M2', section: 'ม.2/1' });
    expect(response.status).toBe(201);
    roomIds.push(response.body.data.class.id);
    return response.body.data.class as { id: number; join_code: string; created_at: string };
  }

  it('persists the full flow, concurrent duplicate joins, literal text and UTC timestamps', async () => {
    const room = await createRoom();
    expect(Math.abs(Date.now() - Date.parse(room.created_at))).toBeLessThan(10_000);
    const joined = await Promise.all([call('post', '/classes/join', 3).send({ code: room.join_code }), call('post', '/classes/join', 3).send({ code: room.join_code })]);
    expect(joined.map(response => response.status)).toEqual([200, 200]);
    const people = await call('get', `/classes/${room.id}/members`, 3);
    expect(people.body.data.members).toHaveLength(1);
    const body = "ประกาศภาษาไทย\n<script>alert('x')</script>";
    const posted = await call('post', `/classes/${room.id}/announcements`, 2).send({ body });
    expect(posted.status).toBe(201);
    expect(Math.abs(Date.now() - Date.parse(posted.body.data.announcement.created_at))).toBeLessThan(10_000);
    const stream = await call('get', `/classes/${room.id}/announcements`, 3);
    expect(stream.body.data.announcements[0].body).toBe(body);
    expect((await call('get', '/classes', 3)).body.data.classes.find((item: { id: number }) => item.id === room.id).join_code).toBeUndefined();
    expect((await call('patch', `/classes/${room.id}`, 2).send({ name: 'แก้ไขแล้ว', section: '' })).body.data.class.name).toBe('แก้ไขแล้ว');
    expect((await call('delete', `/classes/${room.id}/members/3`, 2)).status).toBe(204);
    expect((await call('get', `/classes/${room.id}/announcements`, 3)).status).toBe(403);
  });

  it('isolates real teacher ownership and nonmember access for every resource', async () => {
    const room = await createRoom();
    const other = await createRoom(secondTeacher);
    expect(other.join_code).not.toBe(room.join_code);
    for (const uid of [secondTeacher, 4, 1]) {
      for (const suffix of ['', '/members', '/announcements']) expect((await call('get', `/classes/${room.id}${suffix}`, uid)).status).toBe(403);
      expect((await call('patch', `/classes/${room.id}`, uid).send({ name: 'Hijacked' })).status).toBe(403);
      expect((await call('post', `/classes/${room.id}/announcements`, uid).send({ body: 'Hijacked' })).status).toBe(403);
      expect((await call('delete', `/classes/${room.id}/members/3`, uid)).status).toBe(403);
    }
    const listed = await call('get', '/classes', secondTeacher);
    expect(listed.body.data.classes.map((item: { id: number }) => item.id)).toEqual([other.id]);
  });

  it('enforces archive in SQL even when an earlier route access check was active', async () => {
    const room = await createRoom();
    await call('post', '/classes/join', 3).send({ code: room.join_code });
    expect((await call('patch', `/classes/${room.id}`, 2).send({ archived: true })).status).toBe(200);
    const store = createClassStore(pool);
    expect(await store.addMember(room.id, 4)).toBe(false);
    expect(await store.update(room.id, 2, { name: 'Wrong' })).toBe(false);
    expect(await store.removeMember(room.id, 2, 3)).toBe(false);
    expect(await store.post(room.id, 2, 'Wrong')).toBeUndefined();
    expect((await call('get', `/classes/${room.id}`, 3)).body.data.class.archived).toBe(true);
    const [rows] = await pool.execute<RowDataPacket[]>('SELECT COUNT(*) AS total FROM class_members WHERE class_id = ?', [room.id]);
    expect(rows[0]!.total).toBe(1);
  });
});
