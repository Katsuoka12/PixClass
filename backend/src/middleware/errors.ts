import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { MulterError } from 'multer';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  if (error instanceof ApiError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  if (error instanceof ZodError) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง' } });
    return;
  }
  if (error instanceof MulterError) {
    const tooLarge = error.code === 'LIMIT_FILE_SIZE';
    res.status(tooLarge ? 413 : 400).json({ error: { code: tooLarge ? 'FILE_TOO_LARGE' : 'INVALID_FILE', message: tooLarge ? 'ไฟล์ต้องมีขนาดไม่เกิน 10 MB' : 'ข้อมูลไฟล์แนบไม่ถูกต้องหรือมีไฟล์มากเกินไป' } });
    return;
  }
  const type = error && typeof error === 'object' && 'type' in error ? error.type : undefined;
  if (type === 'entity.parse.failed' || type === 'entity.too.large') {
    res.status(type === 'entity.too.large' ? 413 : 400).json({
      error: { code: type === 'entity.too.large' ? 'PAYLOAD_TOO_LARGE' : 'INVALID_JSON', message: 'รูปแบบหรือขนาดข้อมูลไม่ถูกต้อง' },
    });
    return;
  }
  // Do not log request bodies, cookies, raw DB errors, or credentials.
  console.error('API request failed');
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง' } });
};
