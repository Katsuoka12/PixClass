import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';
import type { Announcement, Classroom, ClassStore } from '../src/classrooms.js';
import type { AppConfig, User, UserStore } from '../src/types.js';

const config: AppConfig = { JWT_SECRET: 'classroom-tests-secret-at-least-32-characters', WEB_URL: 'http://localhost:3000', NODE_ENV: 'test' };
const users: User[] = ['teacher', 'teacher', 'student', 'student', 'admin'].map((role, i) => ({
  id: i + 1, role: role as User['role'], name: `User ${i + 1}`, email: `u${i + 1}@example.test`, password_hash: 'unused', is_active: 1,
}));
const userStore: UserStore = { async findById(id) { return users.find(user => user.id === id); }, async findByEmail() { return undefined; }, async create() { throw new Error('unused'); } };
let rooms: Classroom[];
let members: Map<number, Set<number>>;
let posts: Announcement[];
let store: ClassStore;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  rooms = [1, 2].map(id => ({ id, teacher_id: id, teacher_name: `User ${id}`, name: `Class ${id}`, section: 'ม.2', join_code: `CODE0${id}`, archived: false, member_count: 0, created_at: '2026-11-16T00:00:00.000Z' }));
  members = new Map([[1, new Set([3])], [2, new Set([4])]]);
  posts = [];
  store = {
    async list(user) { return rooms.filter(room => user.role === 'teacher' ? room.teacher_id === user.id : members.get(room.id)?.has(user.id)); },
    async get(id) { return rooms.find(room => room.id === id); },
    async getByCode(code) { return rooms.find(room => room.join_code === code); },
    async isMember(id, uid) { return members.get(id)?.has(uid) ?? false; },
    async create(teacher, input) { const id = rooms.length + 1; rooms.push({ ...input, id, teacher_id: teacher.id, teacher_name: teacher.name, archived: false, member_count: 0, created_at: new Date().toISOString() }); members.set(id, new Set()); return id; },
    async update(id, teacherId, input) { const room = rooms.find(room => room.id === id && room.teacher_id === teacherId && !room.archived); if (!room) return false; Object.assign(room, input); return true; },
    async addMember(id, uid) { if (rooms.find(room => room.id === id)?.archived) return false; members.get(id)!.add(uid); return true; },
    async removeMember(id, _teacherId, uid) { return members.get(id)?.delete(uid) ?? false; },
    async members(id) { return [...(members.get(id) ?? [])].map(uid => ({ id: uid, name: `User ${uid}`, joined_at: '2026-11-16T00:00:00.000Z' })); },
    async announcements(id) { return posts.filter(post => post.class_id === id).slice().reverse(); },
    async post(id, uid, body) { const post = { id: posts.length + 1, class_id: id, author_id: uid, author_name: `User ${uid}`, body, created_at: new Date().toISOString() }; posts.push(post); return post; },
  };
  app = createApp(config, userStore, store);
});

function call(method: 'get' | 'post' | 'patch' | 'delete', path: string, userId?: number) {
  const pending = request(app)[method](`/api${path}`).set('Origin', config.WEB_URL);
  if (userId) pending.set('Cookie', `session=${jwt.sign({}, config.JWT_SECRET, { subject: String(userId), issuer: 'student-tag', audience: 'student-tag-web', expiresIn: '15m' })}`);
  return pending;
}

describe('classroom HTTP permissions and behavior', () => {
  it('creates a classroom, joins by code and reads the teacher announcement', async () => {
    const created = await call('post', '/classes', 1).send({ name: ' วิทยาศาสตร์ ', section: ' ม.2/1 ' });
    expect(created.status).toBe(201);
    const room = created.body.data.class;
    expect(room).toMatchObject({ name: 'วิทยาศาสตร์', section: 'ม.2/1', teacher_id: 1, archived: false });
    expect(room.join_code).toMatch(/^[A-F0-9]{12}$/);
    const joined = await call('post', '/classes/join', 3).send({ code: room.join_code.toLowerCase() });
    expect(joined.status).toBe(200);
    expect(joined.body.data.class.join_code).toBeUndefined();
    const posted = await call('post', `/classes/${room.id}/announcements`, 1).send({ body: ' เตรียมสมุดสำหรับคาบหน้า ' });
    expect(posted.status).toBe(201);
    expect(posted.body.data.announcement.body).toBe('เตรียมสมุดสำหรับคาบหน้า');
    const stream = await call('get', `/classes/${room.id}/announcements`, 3);
    expect(stream.body.data.announcements[0]).toMatchObject({ body: 'เตรียมสมุดสำหรับคาบหน้า', author_id: 1 });
  });

  it('lists only owned or enrolled classrooms and hides student join codes', async () => {
    const teacher = await call('get', '/classes', 1);
    expect(teacher.body.data.classes.map((room: Classroom) => room.id)).toEqual([1]);
    const student = await call('get', '/classes', 3);
    expect(student.body.data.classes.map((room: Classroom) => room.id)).toEqual([1]);
    expect(student.body.data.classes[0].join_code).toBeUndefined();
  });

  it.each([undefined, 2, 4, 5])('rejects classroom reads by nonparticipant %s', async uid => {
    for (const suffix of ['', '/members', '/announcements']) {
      expect((await call('get', `/classes/1${suffix}`, uid)).status).toBe(uid ? 403 : 401);
    }
  });

  it.each([2, 3, 4, 5])('rejects teacher mutations by user %s', async uid => {
    expect((await call('patch', '/classes/1', uid).send({ name: 'Changed' })).status).toBe(403);
    expect((await call('post', '/classes/1/announcements', uid).send({ body: 'Unauthorized' })).status).toBe(403);
    expect((await call('delete', '/classes/1/members/3', uid)).status).toBe(403);
    expect(rooms[0]!.name).toBe('Class 1');
    expect(posts).toHaveLength(0);
  });

  it.each([3, 5])('rejects classroom creation by nonteacher %s', async uid => {
    expect((await call('post', '/classes', uid).send({ name: 'Unauthorized' })).status).toBe(403);
  });

  it.each([1, 5])('rejects joining by nonstudent %s', async uid => {
    expect((await call('post', '/classes/join', uid).send({ code: 'CODE01' })).status).toBe(403);
  });

  it('makes joins idempotent and revokes every read after member removal', async () => {
    for (let count = 0; count < 2; count++) expect((await call('post', '/classes/join', 3).send({ code: 'CODE01' })).status).toBe(200);
    const people = await call('get', '/classes/1/members', 3);
    expect(people.body.data.members).toHaveLength(1);
    expect(people.body.data.members[0].email).toBeUndefined();
    expect((await call('delete', '/classes/1/members/3', 1)).status).toBe(204);
    for (const suffix of ['', '/members', '/announcements']) expect((await call('get', `/classes/1${suffix}`, 3)).status).toBe(403);
    expect((await call('delete', '/classes/1/members/3', 1)).status).toBe(404);
  });

  it('edits then archives a classroom, preserving reads and blocking changes', async () => {
    expect((await call('patch', '/classes/1', 1).send({ name: 'ใหม่', section: '' })).body.data.class.name).toBe('ใหม่');
    expect((await call('patch', '/classes/1', 1).send({ archived: true })).status).toBe(200);
    expect((await call('get', '/classes/1', 3)).status).toBe(200);
    expect((await call('post', '/classes/join', 4).send({ code: 'CODE01' })).status).toBe(409);
    expect((await call('patch', '/classes/1', 1).send({ name: 'Again' })).status).toBe(409);
    expect((await call('post', '/classes/1/announcements', 1).send({ body: 'Again' })).status).toBe(409);
    expect((await call('delete', '/classes/1/members/3', 1)).status).toBe(409);
  });

  it('validates IDs, empty inputs, lengths and unexpected fields', async () => {
    for (const id of ['0', '-1', 'abc', '1.2', '9007199254740992']) expect((await call('get', `/classes/${id}`, 1)).status).toBe(400);
    for (const input of [{ name: ' ' }, { name: 'x'.repeat(201) }, { name: 'Valid', teacher_id: 2 }]) expect((await call('post', '/classes', 1).send(input)).status).toBe(400);
    for (const input of [{}, { archived: false }, { join_code: 'CUSTOM' }]) expect((await call('patch', '/classes/1', 1).send(input)).status).toBe(400);
    expect((await call('post', '/classes/1/announcements', 1).send({ body: ' ' })).status).toBe(400);
    expect((await call('post', '/classes/1/announcements', 1).send({ body: 'x'.repeat(5001) })).status).toBe(400);
    expect((await call('post', '/classes/join', 3).send({ code: '!' })).status).toBe(400);
    expect((await call('get', '/classes?role=admin', 1)).status).toBe(400);
  });

  it('returns safe not-found errors and preserves announcement text literally', async () => {
    expect((await call('get', '/classes/999', 1)).status).toBe(404);
    expect((await call('post', '/classes/join', 3).send({ code: 'MISSING' })).status).toBe(404);
    const body = '<script>alert(1)</script>\nบรรทัดที่สอง';
    await call('post', '/classes/1/announcements', 1).send({ body });
    expect((await call('get', '/classes/1/announcements', 3)).body.data.announcements[0].body).toBe(body);
  });

  it('retries join code collisions and returns unique classroom codes', async () => {
    const original = store.create;
    let collision = true;
    store.create = async (teacher, input) => { if (collision) { collision = false; throw { code: 'ER_DUP_ENTRY' }; } return original(teacher, input); };
    const first = await call('post', '/classes', 1).send({ name: 'First' });
    const second = await call('post', '/classes', 1).send({ name: 'Second' });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.data.class.join_code).not.toBe(second.body.data.class.join_code);
  });

  it('blocks cross-origin mutations and throttles code guessing', async () => {
    expect((await call('post', '/classes', 1).set('Origin', 'https://evil.example').send({ name: 'Test' })).status).toBe(403);
    for (let count = 0; count < 20; count++) await call('post', '/classes/join', 3).send({ code: 'MISSING' });
    expect((await call('post', '/classes/join', 3).send({ code: 'CODE01' })).status).toBe(429);
  });
});
