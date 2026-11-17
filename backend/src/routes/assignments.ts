import { Router, type Request } from 'express';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import type { AssignmentStore, Submission } from '../assignments.js';
import type { AppConfig, UserStore } from '../types.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { ApiError } from '../middleware/errors.js';
import { uploadService } from '../uploads.js';
import type { NotificationHooks } from '../telegram.js';
import { dispatchNotification } from '../services/notify.js';

const empty = z.strictObject({});
const id = z.string().regex(/^[1-9]\d*$/).pipe(z.coerce.number<string>().int().positive().max(4294967295));
const title = z.string().trim().min(1).max(200);
const description = z.string().trim().max(5000);
const due = z.iso.datetime({ offset: true }).transform(value => new Date(value).toISOString()).nullable();
const points = z.number().int().min(1).max(9999);
const createSchema = z.strictObject({ title, description: description.default(''), due_at: due.default(null), max_points: points.default(100), allow_late: z.boolean().default(true) });
const patchSchema = z.strictObject({ title: title.optional(), description: description.optional(), due_at: due.optional(), max_points: points.optional(), allow_late: z.boolean().optional() }).refine(value => Object.keys(value).length > 0);
const submitSchema = z.strictObject({
  answer_text: z.string().trim().max(5000).default(''),
  remove_file: z.union([z.boolean(), z.enum(['true', 'false']).transform(value => value === 'true')]).default(false),
});
const gradeSchema = z.strictObject({ grade: z.number().min(0).max(9999).refine(value => Math.abs(Math.round(value * 100) - value * 100) < 1e-7), feedback: z.string().trim().max(5000).default('') });

export function publicSubmission(submission: Submission) {
  const { file_path, ...rest } = submission;
  return { ...rest, file_url: file_path ? `/api/submissions/${submission.id}/file` : null };
}

export function assignmentsRouter(config: AppConfig, users: UserStore, store: AssignmentStore, directory?: string, notifications?: NotificationHooks) {
  const router = Router();
  const auth = authenticate(config, users);
  const teacher = requireRole('teacher');
  const student = requireRole('student');
  const uploads = uploadService(directory ?? fileURLToPath(new URL('../../uploads/', import.meta.url)));
  const uploadLimit = rateLimit({ windowMs: 5 * 60_000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: { code: 'RATE_LIMITED', message: 'ส่งงานหลายครั้งเกินไป กรุณารอสักครู่' } } });
  const parseId = (req: Request) => { empty.parse(req.query); return id.parse(req.params.id); };

  router.get('/classes/:id/assignments', auth, async (req, res) => {
    res.json({ data: { assignments: await store.list(parseId(req), res.locals.user) } });
  });
  router.post('/classes/:id/assignments', auth, teacher, async (req, res) => {
    const assignment = await store.create(parseId(req), res.locals.user, createSchema.parse(req.body));
    const teacherUser = res.locals.user;
    dispatchNotification(notifications ? () => notifications.assignment(assignment.id, teacherUser) : undefined);
    res.status(201).json({ data: { assignment } });
  });
  router.get('/assignments/:id', auth, async (req, res) => {
    res.json({ data: { assignment: await store.get(parseId(req), res.locals.user) } });
  });
  router.patch('/assignments/:id', auth, teacher, async (req, res) => {
    res.json({ data: { assignment: await store.update(parseId(req), res.locals.user, patchSchema.parse(req.body)) } });
  });
  router.delete('/assignments/:id', auth, teacher, async (req, res) => {
    empty.parse(req.body ?? {});
    const files = await store.delete(parseId(req), res.locals.user);
    await Promise.all(files.map(file => uploads.remove(file)));
    res.status(204).end();
  });
  router.get('/assignments/:id/submission', auth, student, async (req, res) => {
    const submission = await store.getSubmission(parseId(req), res.locals.user);
    res.json({ data: { submission: submission ? publicSubmission(submission) : null } });
  });
  router.put('/assignments/:id/submission', auth, student, uploadLimit, async (req, res) => {
    const assignmentId = parseId(req);
    const assignment = await store.get(assignmentId, res.locals.user);
    if (assignment.class_archived) throw new ApiError(409, 'CLASS_ARCHIVED', 'ห้องเรียนนี้ถูกเก็บแล้ว');
    let saved = false;
    try {
      await new Promise<void>((success, failure) => uploads.parse(req, res, error => error ? failure(error) : success()));
      const input = submitSchema.parse(req.body ?? {});
      if (input.remove_file && req.file) throw new ApiError(400, 'VALIDATION_ERROR', 'เลือกแทนที่ไฟล์หรือลบไฟล์อย่างใดอย่างหนึ่ง');
      const file = req.file ? await uploads.validate(req.file) : undefined;
      const result = await store.submit(assignmentId, res.locals.user, { ...input, file });
      saved = true;
      await uploads.remove(result.replacedFile);
      res.json({ data: { submission: publicSubmission(result.submission) } });
    } finally {
      if (!saved && req.file) await uploads.remove(req.file.filename);
    }
  });
  router.get('/assignments/:id/submissions', auth, teacher, async (req, res) => {
    const rows = await store.submissions(parseId(req), res.locals.user);
    res.json({ data: { submissions: rows.map(row => ({ ...row, submission: row.submission ? publicSubmission(row.submission) : null })) } });
  });
  router.patch('/submissions/:id/grade', auth, teacher, async (req, res) => {
    const submission = await store.grade(parseId(req), res.locals.user, gradeSchema.parse(req.body));
    const teacherUser = res.locals.user;
    dispatchNotification(notifications ? () => notifications.grade(submission, teacherUser) : undefined);
    res.json({ data: { submission: publicSubmission(submission) } });
  });
  router.get('/submissions/:id/file', auth, async (req, res, next) => {
    const submission = await store.file(parseId(req), res.locals.user);
    if (!submission.file_path || !submission.original_name) throw new ApiError(404, 'FILE_NOT_FOUND', 'ไม่พบไฟล์แนบ');
    const path = resolve(uploads.path(submission.file_path));
    res.type(uploads.mime(submission.file_path));
    res.download(path, submission.original_name, { dotfiles: 'deny', headers: { 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' } }, error => {
      if (error && !res.headersSent) next(new ApiError(404, 'FILE_NOT_FOUND', 'ไม่พบไฟล์แนบ'));
    });
  });
  router.get('/classes/:id/gradebook', auth, teacher, async (req, res) => {
    const book = await store.gradebook(parseId(req), res.locals.user);
    res.json({ data: { ...book, students: book.students.map(person => ({ ...person, submissions: person.submissions.map(publicSubmission) })) } });
  });
  router.get('/me/todo', auth, student, async (req, res) => {
    empty.parse(req.query);
    const items = await store.todo(res.locals.user);
    res.json({ data: { items: items.map(item => ({ ...item, submission: item.submission ? publicSubmission(item.submission) : null })) } });
  });
  return router;
}
