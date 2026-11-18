import { Router } from 'express';
import bcrypt from 'bcrypt';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import type { AppConfig, UserStore } from '../types.js';
import type { AdminStore } from '../admin.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const empty = z.strictObject({});
const pageSchema = z.strictObject({ page: z.string().regex(/^[1-9]\d*$/).pipe(z.coerce.number<string>().int().max(1000000)).default(1) });
const id = z.string().regex(/^[1-9]\d*$/).pipe(z.coerce.number<string>().int().positive().max(4294967295));
const teacherSchema = z.strictObject({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  password: z.string().min(8).max(72).refine(value => Buffer.byteLength(value, 'utf8') <= 72),
});

export function adminRouter(config: AppConfig, users: UserStore, store: AdminStore) {
  const router = Router();
  const auth = authenticate(config, users);
  const admin = requireRole('admin');
  const createLimit = rateLimit({ windowMs: 15 * 60_000, limit: 10, keyGenerator: (_req, res) => String(res.locals.user.id), standardHeaders: 'draft-8', legacyHeaders: false, message: { error: { code: 'RATE_LIMITED', message: 'สร้างบัญชีหลายครั้งเกินไป กรุณารอสักครู่' } } });
  router.get('/admin/users', auth, admin, async (req, res) => {
    const { page } = pageSchema.parse(req.query);
    res.json({ data: await store.list(res.locals.user, page) });
  });
  router.post('/admin/users', auth, admin, createLimit, async (req, res) => {
    empty.parse(req.query);
    const input = teacherSchema.parse(req.body);
    const user = await store.createTeacher(res.locals.user, { name: input.name, email: input.email, password_hash: await bcrypt.hash(input.password, 12) });
    res.status(201).json({ data: { user } });
  });
  router.patch('/admin/users/:id', auth, admin, async (req, res) => {
    empty.parse(req.query);
    const { is_active } = z.strictObject({ is_active: z.boolean() }).parse(req.body);
    res.json({ data: { user: await store.setActive(id.parse(req.params.id), res.locals.user, is_active) } });
  });
  return router;
}
