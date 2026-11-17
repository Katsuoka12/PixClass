import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import type { ClassStore, Classroom } from '../classrooms.js';
import type { AppConfig, User, UserStore } from '../types.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { ApiError } from '../middleware/errors.js';
import type { NotificationHooks } from '../telegram.js';
import { dispatchNotification } from '../services/notify.js';

const empty = z.strictObject({});
const idSchema = z.string().regex(/^[1-9]\d*$/).pipe(z.coerce.number<string>().int().positive().max(4294967295));
const name = z.string().trim().min(1).max(200);
const section = z.string().trim().max(100);
const createSchema = z.strictObject({ name, section: section.default('') });
const patchSchema = z.strictObject({ name: name.optional(), section: section.optional(), archived: z.literal(true).optional() })
  .refine(value => Object.keys(value).length > 0);
const joinSchema = z.strictObject({ code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{6,20}$/) });

function expose(room: Classroom, user: User) {
  const { join_code, ...rest } = room;
  return user.role === 'teacher' && user.id === room.teacher_id ? { ...rest, join_code } : rest;
}
function writable(room: Classroom) {
  if (room.archived) throw new ApiError(409, 'CLASS_ARCHIVED', 'ห้องเรียนนี้ถูกเก็บแล้ว อ่านข้อมูลเดิมได้เท่านั้น');
}

export function classesRouter(config: AppConfig, users: UserStore, store: ClassStore, notifications?: NotificationHooks) {
  const router = Router();
  router.use(authenticate(config, users));
  router.use((_req, res, next) => {
    if (!['teacher', 'student'].includes(res.locals.user.role)) throw new ApiError(403, 'FORBIDDEN', 'คุณไม่มีสิทธิ์เข้าถึงห้องเรียน');
    next();
  });
  async function access(id: number, user: User) {
    const room = await store.get(id);
    if (!room) throw new ApiError(404, 'CLASS_NOT_FOUND', 'ไม่พบห้องเรียน');
    if (!(user.role === 'teacher' && room.teacher_id === user.id)
      && !(user.role === 'student' && await store.isMember(id, user.id))) {
      throw new ApiError(403, 'FORBIDDEN', 'คุณไม่ได้เป็นสมาชิกหรือเจ้าของห้องเรียนนี้');
    }
    return room;
  }
  router.get('/', async (req, res) => {
    empty.parse(req.query);
    res.json({ data: { classes: (await store.list(res.locals.user)).map(room => expose(room, res.locals.user)) } });
  });
  router.post('/', requireRole('teacher'), async (req, res) => {
    empty.parse(req.query);
    const input = createSchema.parse(req.body);
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const id = await store.create(res.locals.user, { ...input, join_code: randomBytes(6).toString('hex').toUpperCase() });
        const room = await store.get(id);
        if (!room) throw new Error('Created classroom not found');
        res.status(201).json({ data: { class: expose(room, res.locals.user) } });
        return;
      } catch (error) {
        if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ER_DUP_ENTRY')) throw error;
      }
    }
    throw new Error('Classroom code allocation failed');
  });
  router.post('/join', requireRole('student'), rateLimit({
    windowMs: 60_000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'ลองรหัสหลายครั้งเกินไป กรุณารอสักครู่' } },
  }), async (req, res) => {
    empty.parse(req.query);
    const { code } = joinSchema.parse(req.body);
    const room = await store.getByCode(code);
    if (!room) throw new ApiError(404, 'CLASS_NOT_FOUND', 'ไม่พบห้องเรียนจากรหัสนี้');
    writable(room);
    if (!await store.addMember(room.id, res.locals.user.id)) throw new ApiError(409, 'CLASS_ARCHIVED', 'ห้องเรียนนี้ถูกเก็บแล้ว');
    const joined = await store.get(room.id);
    if (!joined) throw new ApiError(404, 'CLASS_NOT_FOUND', 'ไม่พบห้องเรียน');
    res.json({ data: { class: expose(joined, res.locals.user) } });
  });
  router.get('/:id', async (req, res) => {
    empty.parse(req.query);
    const room = await access(idSchema.parse(req.params.id), res.locals.user);
    res.json({ data: { class: expose(room, res.locals.user) } });
  });
  router.patch('/:id', requireRole('teacher'), async (req, res) => {
    empty.parse(req.query);
    const id = idSchema.parse(req.params.id);
    const input = patchSchema.parse(req.body);
    writable(await access(id, res.locals.user));
    if (!await store.update(id, res.locals.user.id, input)) throw new ApiError(409, 'CLASS_ARCHIVED', 'ห้องเรียนนี้ถูกเก็บแล้ว');
    const room = await store.get(id);
    if (!room) throw new ApiError(404, 'CLASS_NOT_FOUND', 'ไม่พบห้องเรียน');
    res.json({ data: { class: expose(room, res.locals.user) } });
  });
  router.get('/:id/members', async (req, res) => {
    empty.parse(req.query);
    const id = idSchema.parse(req.params.id);
    const room = await access(id, res.locals.user);
    res.json({ data: { teacher: { id: room.teacher_id, name: room.teacher_name }, members: await store.members(id) } });
  });
  router.delete('/:id/members/:userId', requireRole('teacher'), async (req, res) => {
    empty.parse(req.query);
    empty.parse(req.body ?? {});
    const id = idSchema.parse(req.params.id);
    const userId = idSchema.parse(req.params.userId);
    writable(await access(id, res.locals.user));
    if (!await store.removeMember(id, res.locals.user.id, userId)) throw new ApiError(404, 'MEMBER_NOT_FOUND', 'ไม่พบสมาชิกในห้องเรียน');
    res.status(204).end();
  });
  router.get('/:id/announcements', async (req, res) => {
    empty.parse(req.query);
    const id = idSchema.parse(req.params.id);
    await access(id, res.locals.user);
    res.json({ data: { announcements: await store.announcements(id) } });
  });
  router.post('/:id/announcements', requireRole('teacher'), async (req, res) => {
    empty.parse(req.query);
    const id = idSchema.parse(req.params.id);
    const { body } = z.strictObject({ body: z.string().trim().min(1).max(5000) }).parse(req.body);
    writable(await access(id, res.locals.user));
    const announcement = await store.post(id, res.locals.user.id, body);
    if (!announcement) throw new ApiError(409, 'CLASS_ARCHIVED', 'ห้องเรียนนี้ถูกเก็บแล้ว');
    dispatchNotification(notifications ? () => notifications.announcement(id, body, announcement.id) : undefined);
    res.status(201).json({ data: { announcement } });
  });
  return router;
}
