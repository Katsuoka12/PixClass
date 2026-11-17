import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Router, json, type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import type { Update } from 'grammy/types';
import type { AppConfig, UserStore } from '../types.js';
import type { TelegramIntegration } from '../telegram.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { ApiError } from '../middleware/errors.js';

const empty = z.strictObject({});
const id = z.string().regex(/^[1-9]\d*$/).pipe(z.coerce.number<string>().int().positive().max(4294967295));
const int = z.number().int().safe();
const updateSchema = z.looseObject({
  update_id: int.nonnegative(),
  message: z.looseObject({
    message_id: int, date: int,
    chat: z.looseObject({ id: int, type: z.enum(['private', 'group', 'supergroup', 'channel']) }),
    from: z.looseObject({ id: int, is_bot: z.boolean(), first_name: z.string() }).optional(),
    text: z.string().max(65536).optional(),
    entities: z.array(z.looseObject({ type: z.string(), offset: int.nonnegative(), length: int.nonnegative() })).max(100).optional(),
  }).optional(),
});

export function telegramWebhook(secret: string, handleUpdate: (update: Update) => Promise<void>): RequestHandler {
  const parse = json({ limit: '256kb' });
  return (req, res, next) => {
    const received = Buffer.from(req.get('X-Telegram-Bot-Api-Secret-Token') ?? '');
    const expected = Buffer.from(secret);
    if (!expected.length || received.length !== expected.length || !timingSafeEqual(received, expected)) {
      next(new ApiError(403, 'WEBHOOK_REJECTED', 'ไม่ได้รับอนุญาต'));
      return;
    }
    parse(req, res, error => {
      if (error) { next(error); return; }
      void (async () => {
        empty.parse(req.query);
        updateSchema.parse(req.body);
        await handleUpdate(req.body as Update);
        res.json({ ok: true });
      })().catch(next);
    });
  };
}

export function telegramRouter(config: AppConfig, users: UserStore, integration: TelegramIntegration) {
  const router = Router();
  const auth = authenticate(config, users);
  const limit = (windowMs: number, count: number) => rateLimit({
    windowMs, limit: count, keyGenerator: (_req, res) => String(res.locals.user.id),
    standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'ส่งคำขอบ่อยเกินไป กรุณารอสักครู่' } },
  });
  function configured() {
    if (!integration.configured) throw new ApiError(503, 'TELEGRAM_NOT_CONFIGURED', 'ผู้ดูแลยังไม่ได้ตั้งค่า Telegram Bot');
  }
  router.get('/telegram/status', auth, async (req, res) => {
    empty.parse(req.query);
    const account = await integration.store.account(res.locals.user.id);
    res.json({ data: { configured: integration.configured, connected: !!account?.chat_id, muted: account?.muted ?? false } });
  });
  router.post('/telegram/link-token', auth, limit(15 * 60_000, 5), async (req, res) => {
    empty.parse(req.query); empty.parse(req.body);
    configured();
    const token = randomBytes(16).toString('hex');
    const expires_at = await integration.store.issueLink(res.locals.user.id, token);
    res.status(201).json({ data: { url: `https://t.me/${integration.username}?start=${token}`, expires_at } });
  });
  router.post('/assignments/:id/remind', auth, requireRole('teacher'), limit(60_000, 1), async (req, res) => {
    empty.parse(req.query); empty.parse(req.body);
    const assignmentId = id.parse(req.params.id);
    configured();
    res.json({ data: await integration.hooks.remind(assignmentId, res.locals.user) });
  });
  return router;
}
