import { Router } from 'express';
import { z } from 'zod';
import type { CalendarStore } from '../calendar.js';
import type { AppConfig, UserStore } from '../types.js';
import { authenticate } from '../middleware/auth.js';
import { ApiError } from '../middleware/errors.js';
import { publicSubmission } from './assignments.js';

export function calendarRouter(config: AppConfig, users: UserStore, store: CalendarStore) {
  const router = Router();
  router.get('/me/calendar', authenticate(config, users), async (req, res) => {
    if (!['teacher', 'student'].includes(res.locals.user.role)) throw new ApiError(403, 'FORBIDDEN', 'คุณไม่มีสิทธิ์เปิดปฏิทินงาน');
    const { month } = z.strictObject({ month: z.string().regex(/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/) }).parse(req.query);
    const result = await store.month(month, res.locals.user);
    res.json({ data: { ...result, items: result.items.map(item => ({ ...item, submission: item.submission ? publicSubmission(item.submission) : null })) } });
  });
  return router;
}
