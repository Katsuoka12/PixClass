import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { createAdminStore } from '../src/admin-db.js';
import type { AdminStore } from '../src/admin.js';
import { loadConfig } from '../src/config.js';
import { createPool } from '../src/db.js';
import type { User } from '../src/types.js';

describe.skipIf(process.env.RUN_DB_TESTS !== '1')('MariaDB admin repository', () => {
  let pool: Pool;
  let store: AdminStore;
  let admin: User;
  let otherAdmin: User;
  let teacher: User;
  let student: User;
  const ids: number[] = [];
  const teacherInput = () => ({ name: "ครู '); DROP TABLE users; --", email: `${randomUUID()}@admin.test`, password_hash: 'already-hashed-by-route' });
  async function addUser(role: User['role']): Promise<User> {
    const email = `${randomUUID()}@admin.test`;
    const [result] = await pool.execute<ResultSetHeader>(
      'INSERT INTO users (role, name, email, password_hash) VALUES (?, ?, ?, ?)', [role, role, email, 'unused-fixture-hash'],
    );
    ids.push(result.insertId);
    return { id: result.insertId, role, name: role, email, password_hash: 'unused-fixture-hash', is_active: 1 };
  }
  beforeAll(async () => {
    const config = loadConfig();
    if (config.DB_NAME !== 'student_tag_m1_test') throw new Error('DB tests require student_tag_m1_test');
    pool = createPool(config);
    store = createAdminStore(pool);
    admin = await addUser('admin');
    otherAdmin = await addUser('admin');
    teacher = await addUser('teacher');
    student = await addUser('student');
  });
  afterAll(async () => {
    if (!pool) return;
    for (const id of ids) await pool.execute('DELETE FROM users WHERE id = ?', [id]);
    await pool.end();
  });

  it('creates teachers with prepared literal input and exposes only documented public fields', async () => {
    const input = teacherInput();
    const user = await store.createTeacher(admin, { ...input, role: 'admin' } as typeof input);
    ids.push(user.id);
    expect(user).toMatchObject({ role: 'teacher', name: input.name, email: input.email, is_active: true });
    expect(Object.keys(user).sort()).toEqual(['created_at', 'email', 'id', 'is_active', 'name', 'role']);
    expect(Math.abs(Date.now() - Date.parse(user.created_at))).toBeLessThan(10_000);
    const [rows] = await pool.execute<RowDataPacket[]>('SELECT password_hash FROM users WHERE id = ?', [user.id]);
    expect(rows[0]?.password_hash).toBe('already-hashed-by-route');
    await expect(store.createTeacher(admin, input)).rejects.toMatchObject({ status: 409, code: 'EMAIL_EXISTS' });
    const [count] = await pool.execute<RowDataPacket[]>('SELECT COUNT(*) AS total FROM users WHERE email = ?', [input.email]);
    expect(count[0]?.total).toBe(1);
  });

  it('paginates 50 accounts with a total count and never exposes hashes or Telegram identifiers', async () => {
    for (let count = 0; count < 52; count++) await addUser('student');
    const first = await store.list(admin, 1);
    const second = await store.list(admin, 2);
    const beyond = await store.list(admin, 1_000_000);
    expect(first).toMatchObject({ page: 1, page_size: 50 });
    expect(first.users).toHaveLength(50);
    expect(second).toMatchObject({ page: 2, page_size: 50 });
    expect(second.users.length).toBeGreaterThan(0);
    expect(first.total).toBeGreaterThanOrEqual(ids.length);
    expect(beyond.users).toEqual([]);
    for (const user of [...first.users, ...second.users]) {
      expect(Object.keys(user).sort()).toEqual(['created_at', 'email', 'id', 'is_active', 'name', 'role']);
      expect(typeof user.is_active).toBe('boolean');
    }
    for (const page of [0, -1, 1.2, Number.NaN, 1_000_001]) await expect(store.list(admin, page)).rejects.toMatchObject({ status: 400 });
  });

  it('suspends/reactivates teachers and students while preserving identity and protecting every admin', async () => {
    for (const target of [teacher, student]) {
      expect(await store.setActive(target.id, admin, false)).toMatchObject({ id: target.id, role: target.role, name: target.name, email: target.email, is_active: false });
      expect((await store.setActive(target.id, admin, false)).is_active).toBe(false);
      expect((await store.setActive(target.id, admin, true)).is_active).toBe(true);
    }
    for (const target of [admin, otherAdmin]) {
      for (const active of [false, true]) await expect(store.setActive(target.id, admin, active)).rejects.toMatchObject({ status: 409, code: 'ADMIN_PROTECTED' });
    }
    await expect(store.setActive(4_000_000_000, admin, false)).rejects.toMatchObject({ status: 404, code: 'USER_NOT_FOUND' });
  });

  it('checks current active administrator role on every operation, ignoring stale actor fields', async () => {
    const operations = (actor: User) => [
      () => store.list(actor, 1),
      () => store.createTeacher(actor, teacherInput()),
      () => store.setActive(student.id, actor, false),
    ];
    for (const actor of [teacher, student]) for (const operation of operations({ ...actor, role: 'admin' })) await expect(operation()).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
    await pool.execute('UPDATE users SET role = ? WHERE id = ?', ['teacher', admin.id]);
    try {
      for (const operation of operations(admin)) await expect(operation()).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
    } finally { await pool.execute('UPDATE users SET role = ? WHERE id = ?', ['admin', admin.id]); }
    await pool.execute('UPDATE users SET is_active = 0 WHERE id = ?', [admin.id]);
    try {
      for (const operation of operations(admin)) await expect(operation()).rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
    } finally { await pool.execute('UPDATE users SET is_active = 1 WHERE id = ?', [admin.id]); }
    for (const operation of operations({ ...admin, id: 4_000_000_000 })) await expect(operation()).rejects.toMatchObject({ status: 401 });
    expect((await store.list(admin, 1)).users.length).toBe(50);
  });

  it('returns the current requested status after another transaction changes the target while waiting', async () => {
    const target = await addUser('student');
    const blocker = await pool.getConnection();
    let pending: ReturnType<AdminStore['setActive']> | undefined;
    try {
      await blocker.beginTransaction();
      await blocker.execute('SELECT id FROM users WHERE id = ? FOR UPDATE', [target.id]);
      pending = store.setActive(target.id, admin, false);
      const outcome = pending.then(value => ({ value, error: null }), (error: unknown) => ({ value: null, error }));
      let waiting = false;
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline) {
        const [sessions] = await pool.execute<RowDataPacket[]>(
          'SELECT ID FROM information_schema.PROCESSLIST WHERE DB = ? AND INFO = ?',
          ['student_tag_m1_test', 'UPDATE users SET is_active = ? WHERE id = ? AND role <> ?'],
        );
        if (sessions.length) { waiting = true; break; }
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      expect(waiting).toBe(true);
      await blocker.execute('UPDATE users SET is_active = 0 WHERE id = ?', [target.id]);
      await blocker.commit();
      const completed = await outcome;
      expect(completed.error).toBeNull();
      expect(completed.value?.is_active).toBe(false);
    } finally {
      await blocker.rollback();
      blocker.release();
      if (pending) await Promise.allSettled([pending]);
    }
  });

  it('rejects mutual administrator suspension concurrently without deadlocking either actor', async () => {
    const results = await Promise.allSettled([store.setActive(otherAdmin.id, admin, false), store.setActive(admin.id, otherAdmin, false)]);
    for (const result of results) {
      expect(result.status).toBe('rejected');
      if (result.status === 'rejected') expect(result.reason).toMatchObject({ status: 409, code: 'ADMIN_PROTECTED' });
    }
  });
});
