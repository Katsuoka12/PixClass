import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { z } from 'zod';
import type { AppConfig, UserStore } from './types.js';
import { authenticate, requireRole, publicUser } from './middleware/auth.js';
import { ApiError, errorHandler } from './middleware/errors.js';
import { authRouter } from './routes/auth.js';
import type { ClassStore } from './classrooms.js';
import { classesRouter } from './routes/classes.js';
import type { AssignmentStore } from './assignments.js';
import { assignmentsRouter } from './routes/assignments.js';

export function createApp(config: AppConfig, users: UserStore, classes?: ClassStore, assignments?: AssignmentStore, uploadRoot?: string) {
  const app = express();
  app.disable('x-powered-by');
  // Only the local Nuxt/reverse proxy may supply client forwarding headers.
  app.set('trust proxy', 'loopback');
  app.use(helmet());
  app.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  app.use(cors({ origin: config.WEB_URL, credentials: true }));
  app.use((req, _res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)
      && (req.get('Origin') !== config.WEB_URL || req.get('Sec-Fetch-Site') === 'cross-site')) {
      throw new ApiError(403, 'CSRF_REJECTED', 'คำขอนี้มาจากแหล่งที่ไม่ได้รับอนุญาต');
    }
    next();
  });
  app.use(express.json({ limit: '16kb' }));
  app.use(cookieParser());
  app.use('/api/auth', authRouter(config, users));
  if (classes) app.use('/api/classes', classesRouter(config, users, classes));
  if (assignments) app.use('/api', assignmentsRouter(config, users, assignments, uploadRoot));
  // Role-specific landing data, separate from classroom authorization.
  for (const role of ['admin', 'teacher', 'student'] as const) {
    app.get(`/api/${role}/overview`, authenticate(config, users), requireRole(role), (req, res) => {
      z.strictObject({}).parse(req.query);
      res.json({ data: { user: publicUser(res.locals.user), milestone: 'M3' } });
    });
  }
  app.use((_req, _res, next) => next(new ApiError(404, 'NOT_FOUND', 'ไม่พบข้อมูลที่ต้องการ')));
  app.use(errorHandler);
  return app;
}
