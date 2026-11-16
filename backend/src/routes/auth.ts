import { Router } from 'express';
import bcrypt from 'bcrypt';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import type { AppConfig, UserStore } from '../types.js';
import { authenticate, cookieOptions, publicUser, setSession } from '../middleware/auth.js';
import { ApiError } from '../middleware/errors.js';

const email = z.string().trim().toLowerCase().max(254).pipe(z.email());
const password = z.string().min(8).max(72).refine(value => Buffer.byteLength(value, 'utf8') <= 72);
const loginSchema = z.strictObject({ email, password });
const registerSchema = z.strictObject({ name: z.string().trim().min(1).max(100), email, password });
const noInput = z.strictObject({});
// Fixed non-account hash keeps unknown-user password checks on the bcrypt path.
const dummyHash = await bcrypt.hash('unused-account-password', 12);

export function authRouter(config: AppConfig, users: UserStore) {
  const router = Router();
  const limiter = () => rateLimit({
    windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'ลองหลายครั้งเกินไป กรุณารอ 15 นาที' } },
  });
  router.post('/register', limiter(), async (req, res) => {
    noInput.parse(req.query);
    const input = registerSchema.parse(req.body);
    if (await users.findByEmail(input.email)) throw new ApiError(409, 'EMAIL_EXISTS', 'อีเมลนี้ถูกใช้งานแล้ว');
    let id: number;
    try {
      id = await users.create({ name: input.name, email: input.email, password_hash: await bcrypt.hash(input.password, 12) });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ER_DUP_ENTRY') {
        throw new ApiError(409, 'EMAIL_EXISTS', 'อีเมลนี้ถูกใช้งานแล้ว');
      }
      throw error;
    }
    const user = await users.findById(id);
    if (!user) throw new Error('Created user not found');
    setSession(res, user, config);
    res.status(201).json({ data: { user: publicUser(user) } });
  });
  router.post('/login', limiter(), async (req, res) => {
    noInput.parse(req.query);
    const input = loginSchema.parse(req.body);
    const user = await users.findByEmail(input.email);
    const valid = await bcrypt.compare(input.password, user?.password_hash ?? dummyHash);
    if (!user || !valid || !user.is_active) throw new ApiError(401, 'INVALID_CREDENTIALS', 'อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    setSession(res, user, config);
    res.json({ data: { user: publicUser(user) } });
  });
  router.post('/logout', (req, res) => {
    noInput.parse(req.query);
    noInput.parse(req.body ?? {});
    res.clearCookie('session', cookieOptions(config));
    res.status(204).end();
  });
  router.get('/me', authenticate(config, users), (req, res) => {
    noInput.parse(req.query);
    res.json({ data: { user: publicUser(res.locals.user) } });
  });
  return router;
}
