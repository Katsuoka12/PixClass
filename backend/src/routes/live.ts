import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import type { AppConfig, UserStore } from '../types.js';
import type { LiveIntegration } from '../live.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { ApiError } from '../middleware/errors.js';
import { dispatchNotification } from '../services/notify.js';

const empty = z.strictObject({});
const id = z.string().regex(/^[1-9]\d*$/).pipe(z.coerce.number<string>().int().positive().max(4294967295));
const startSchema = z.strictObject({ title: z.string().trim().min(1).max(200) });
const joinSchema = z.strictObject({ t: z.string().regex(/^[a-f0-9]{64}$/) });

export function liveRouter(config: AppConfig, users: UserStore, live: LiveIntegration) {
  const router = Router();
  const auth = authenticate(config, users);
  const teacher = requireRole('teacher');
  const limit = (windowMs: number, count: number) => rateLimit({
    windowMs, limit: count, keyGenerator: (_req, res) => String(res.locals.user.id), standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'ส่งคำขอบ่อยเกินไป กรุณารอสักครู่' } },
  });
  router.get('/classes/:id/live', auth, async (req, res) => {
    empty.parse(req.query);
    res.json({ data: { sessions: await live.store.list(id.parse(req.params.id), res.locals.user) } });
  });
  router.post('/classes/:id/live/start', auth, teacher, limit(5 * 60_000, 10), async (req, res) => {
    empty.parse(req.query);
    const { title } = startSchema.parse(req.body);
    const owner = res.locals.user;
    const session = await live.store.start(id.parse(req.params.id), owner, title);
    dispatchNotification(() => live.notifications.invite(session, owner));
    res.status(201).json({ data: { session } });
  });
  router.post('/live/:id/link', auth, limit(60_000, 30), async (req, res) => {
    empty.parse(req.query); empty.parse(req.body);
    const link = await live.store.issueToken(id.parse(req.params.id), res.locals.user);
    res.status(201).json({ data: { url: `${config.WEB_URL}/live/join?t=${link.token}`, expires_at: link.expires_at } });
  });
  router.get('/live/join', auth, limit(60_000, 60), async (req, res) => {
    if (req.get('X-Live-Join') !== '1' || req.get('Sec-Fetch-Site') === 'cross-site') throw new ApiError(403, 'CSRF_REJECTED', 'กรุณาเข้าห้องเรียนผ่านปุ่มบนเว็บไซต์');
    const { t } = joinSchema.parse(req.query);
    const joined = await live.store.join(t, res.locals.user);
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.json({ data: { ...joined, domain: live.domain } });
  });
  router.post('/live/:id/leave', auth, async (req, res) => {
    empty.parse(req.query); empty.parse(req.body);
    await live.store.leave(id.parse(req.params.id), res.locals.user);
    res.status(204).end();
  });
  router.post('/live/:id/end', auth, teacher, async (req, res) => {
    empty.parse(req.query); empty.parse(req.body);
    res.json({ data: { session: await live.store.end(id.parse(req.params.id), res.locals.user) } });
  });
  router.get('/live/:id/attendance', auth, teacher, async (req, res) => {
    empty.parse(req.query);
    res.json({ data: await live.store.attendance(id.parse(req.params.id), res.locals.user) });
  });
  router.post('/live/:id/remind-absent', auth, teacher, limit(60_000, 1), async (req, res) => {
    empty.parse(req.query); empty.parse(req.body);
    res.json({ data: await live.notifications.remindAbsent(id.parse(req.params.id), res.locals.user) });
  });
  return router;
}
