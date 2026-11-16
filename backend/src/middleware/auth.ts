import jwt from 'jsonwebtoken';
import type { CookieOptions, RequestHandler, Response } from 'express';
import { z } from 'zod';
import type { AppConfig, Role, User, UserStore } from '../types.js';
import { ApiError } from './errors.js';

declare global {
  namespace Express {
    interface Locals { user: User }
  }
}

export function cookieOptions(config: AppConfig): CookieOptions {
  return { httpOnly: true, sameSite: 'lax', secure: config.WEB_URL.startsWith('https://'), path: '/' };
}

export function setSession(res: Response, user: User, config: AppConfig): void {
  const token = jwt.sign({}, config.JWT_SECRET, {
    algorithm: 'HS256', subject: String(user.id), expiresIn: '15m',
    issuer: 'student-tag', audience: 'student-tag-web',
  });
  res.cookie('session', token, { ...cookieOptions(config), maxAge: 15 * 60 * 1000 });
}

export function publicUser(user: User) {
  return { id: user.id, role: user.role, name: user.name, email: user.email };
}

export function authenticate(config: AppConfig, users: UserStore): RequestHandler {
  return async (req, res, next) => {
    const token = z.string().min(1).max(4096).safeParse(req.cookies?.session);
    if (!token.success) throw new ApiError(401, 'UNAUTHENTICATED', 'กรุณาเข้าสู่ระบบ');
    let id: number;
    try {
      const payload = jwt.verify(token.data, config.JWT_SECRET, {
        algorithms: ['HS256'], issuer: 'student-tag', audience: 'student-tag-web',
      });
      if (typeof payload === 'string') throw new Error('Invalid payload');
      id = z.coerce.number().int().positive().safe().parse(payload.sub);
    } catch {
      throw new ApiError(401, 'UNAUTHENTICATED', 'กรุณาเข้าสู่ระบบอีกครั้ง');
    }
    const user = await users.findById(id);
    if (!user || !user.is_active) throw new ApiError(401, 'UNAUTHENTICATED', 'กรุณาเข้าสู่ระบบอีกครั้ง');
    res.locals.user = user;
    next();
  };
}

export function requireRole(role: Role): RequestHandler {
  return (_req, res, next) => {
    if (res.locals.user.role !== role) throw new ApiError(403, 'FORBIDDEN', 'คุณไม่มีสิทธิ์เข้าถึงหน้านี้');
    next();
  };
}
