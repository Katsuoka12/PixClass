import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import type { Pool, ResultSetHeader } from 'mysql2/promise';
import { createApp } from '../src/app.js';
import { createPool, createUserStore } from '../src/db.js';
import { createClassStore } from '../src/class-db.js';
import { loadConfig } from '../src/config.js';
import { createAssignmentStore } from '../src/assignment-db.js';

describe.skipIf(process.env.RUN_DB_TESTS !== '1')('M3 HTTP, authorization and protected uploads', () => {
  let pool: Pool;
  let app: ReturnType<typeof createApp>;
  let uploadRoot: string;
  let classId: number;
  let assignmentId: number;
  let secret: string;
  const createdAssignments: number[] = [];
  const origin = 'http://localhost:3000';
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<<>>\n%%EOF');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT6cAAAAASUVORK5CYII=', 'base64');
  beforeAll(async () => {
    const config = loadConfig();
    if (config.DB_NAME !== 'student_tag_m1_test') throw new Error('Use the disposable student_tag_m1_test database');
    secret = config.JWT_SECRET;
    pool = createPool(config);
    uploadRoot = await mkdtemp(join(tmpdir(), 'student-tag-m3-'));
    const [room] = await pool.execute<ResultSetHeader>('INSERT INTO classes (teacher_id, name, section, join_code) VALUES (?, ?, ?, ?)', [2, 'HTTP M3', '', randomUUID().slice(0, 12)]);
    classId = room.insertId;
    await pool.execute('INSERT INTO class_members (class_id, user_id) VALUES (?, ?), (?, ?)', [classId, 3, classId, 4]);
    const [task] = await pool.execute<ResultSetHeader>('INSERT INTO assignments (class_id,title,description,max_points) VALUES (?,?,?,?)', [classId, 'HTTP fixture', '', 100]);
    assignmentId = task.insertId;
    createdAssignments.push(assignmentId);
    const store = createAssignmentStore(pool);
    app = createApp(config, createUserStore(pool), createClassStore(pool), store, uploadRoot);
  });
  afterAll(async () => {
    if (pool) {
      for (const id of createdAssignments) {
        await pool.execute('DELETE FROM submissions WHERE assignment_id = ?', [id]);
        await pool.execute('DELETE FROM assignments WHERE id = ?', [id]);
      }
      if (classId) {
        await pool.execute('DELETE FROM class_members WHERE class_id = ?', [classId]);
        await pool.execute('DELETE FROM classes WHERE id = ?', [classId]);
      }
      await pool.end();
    }
    if (uploadRoot) {
      expect(dirname(uploadRoot)).toBe(tmpdir());
      await rm(uploadRoot, { recursive: true, force: true });
    }
  });
  function call(method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string, uid?: number) {
    const pending = request(app)[method](`/api${path}`).set('Origin', origin);
    if (uid) pending.set('Cookie', `session=${jwt.sign({}, secret, { subject: String(uid), issuer: 'student-tag', audience: 'student-tag-web', expiresIn: '15m' })}`);
    return pending;
  }

  it('creates, edits and deletes assignments with role and ownership protection', async () => {
    expect((await call('post', `/classes/${classId}/assignments`, 3).send({ title: 'Forbidden' })).status).toBe(403);
    const created = await call('post', `/classes/${classId}/assignments`, 2).send({ title: ' งานใหม่ ', description: 'คำอธิบาย', due_at: '2030-01-01T10:00:00+07:00', max_points: 20, allow_late: false });
    expect(created.status).toBe(201);
    const id = created.body.data.assignment.id;
    createdAssignments.push(id);
    expect(created.body.data.assignment).toMatchObject({ title: 'งานใหม่', max_points: 20, allow_late: false, due_at: '2030-01-01T03:00:00.000Z' });
    expect((await call('patch', `/assignments/${id}`, 2).send({ max_points: 30 })).body.data.assignment.max_points).toBe(30);
    expect((await call('get', `/assignments/${id}`, 5)).status).toBe(403);
    expect((await call('delete', `/assignments/${id}`, 3)).status).toBe(403);
    expect((await call('delete', `/assignments/${id}`, 2)).status).toBe(204);
    expect((await call('get', `/assignments/${id}`, 2)).status).toBe(404);
  });

  it('submits a real file, protects downloads, retains/replaces/removes attachments and cleans old files', async () => {
    const uploaded = await call('put', `/assignments/${assignmentId}/submission`, 3).field('answer_text', 'คำตอบ').attach('file', pdf, 'original.pdf');
    expect(uploaded.status).toBe(200);
    const submitted = uploaded.body.data.submission;
    expect(submitted.file_path).toBeUndefined();
    expect(submitted.file_url).toBe(`/api/submissions/${submitted.id}/file`);
    expect(await readdir(uploadRoot)).toHaveLength(1);
    const names = await readdir(uploadRoot);
    expect(names[0]).toMatch(/^[a-f0-9]{64}\.pdf$/);
    const file = await call('get', `/submissions/${submitted.id}/file`, 3);
    expect(file.status).toBe(200);
    expect(file.headers['content-disposition']).toContain('attachment');
    expect(file.headers['x-content-type-options']).toBe('nosniff');
    expect((await call('get', `/submissions/${submitted.id}/file`, 2)).status).toBe(200);
    for (const uid of [undefined, 4, 5, 1]) expect((await call('get', `/submissions/${submitted.id}/file`, uid)).status).toBe(uid ? 403 : 401);
    const edited = await call('put', `/assignments/${assignmentId}/submission`, 3).send({ answer_text: 'แก้ไขคำตอบ' });
    expect(edited.body.data.submission.original_name).toBe('original.pdf');
    expect(await readdir(uploadRoot)).toHaveLength(1);
    const replaced = await call('put', `/assignments/${assignmentId}/submission`, 3).field('answer_text', '').attach('file', png, 'image.png');
    expect(replaced.status).toBe(200);
    expect(replaced.body.data.submission.original_name).toBe('image.png');
    expect(await readdir(uploadRoot)).toHaveLength(1);
    expect((await readdir(uploadRoot))[0]).toMatch(/\.png$/);
    const removed = await call('put', `/assignments/${assignmentId}/submission`, 3).send({ answer_text: 'ข้อความอย่างเดียว', remove_file: true });
    expect(removed.body.data.submission.file_url).toBeNull();
    expect(await readdir(uploadRoot)).toHaveLength(0);
  });

  it('rejects fake/mismatched/oversized uploads and leaves no orphan files', async () => {
    for (const [bytes, filename] of [[Buffer.from('not a PDF'), 'fake.pdf'], [pdf, 'mismatch.png'], [Buffer.from('<svg/>'), 'image.svg']] as const) {
      const response = await call('put', `/assignments/${assignmentId}/submission`, 4).field('answer_text', '').attach('file', bytes, filename);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_FILE');
    }
    const oversized = await call('put', `/assignments/${assignmentId}/submission`, 4).field('answer_text', '').attach('file', Buffer.alloc(10 * 1024 * 1024 + 1), 'large.pdf');
    expect(oversized.status).toBe(413);
    expect(oversized.body.error.code).toBe('FILE_TOO_LARGE');
    expect(await readdir(uploadRoot)).toHaveLength(0);
  });

  it('grades zero, locks student edits, includes missing students and hides private file paths', async () => {
    const submitted = await call('put', `/assignments/${assignmentId}/submission`, 3).send({ answer_text: 'งานสำหรับตรวจ' });
    expect(submitted.status).toBe(200);
    const id = submitted.body.data.submission.id;
    expect((await call('patch', `/submissions/${id}/grade`, 4).send({ grade: 10 })).status).toBe(403);
    expect((await call('patch', `/submissions/${id}/grade`, 2).send({ grade: 101 })).status).toBe(400);
    expect((await call('patch', `/submissions/${id}/grade`, 2).send({ grade: -1 })).status).toBe(400);
    expect((await call('patch', `/submissions/${id}/grade`, 2).send({ grade: 1.234 })).status).toBe(400);
    const graded = await call('patch', `/submissions/${id}/grade`, 2).send({ grade: 0, feedback: 'กรุณาทบทวน' });
    expect(graded.status).toBe(200);
    expect(graded.body.data.submission.grade).toBe(0);
    expect((await call('put', `/assignments/${assignmentId}/submission`, 3).field('answer_text', 'เปลี่ยน').attach('file', pdf, 'blocked.pdf')).status).toBe(409);
    expect(await readdir(uploadRoot)).toHaveLength(0);
    const mine = await call('get', `/assignments/${assignmentId}/submission`, 3);
    expect(mine.body.data.submission.feedback).toBe('กรุณาทบทวน');
    const roster = await call('get', `/assignments/${assignmentId}/submissions`, 2);
    expect(roster.body.data.submissions.find((row: { student_id: number }) => row.student_id === 4).status).toBe('missing');
    const book = await call('get', `/classes/${classId}/gradebook`, 2);
    expect(book.status).toBe(200);
    expect(book.body.data.students.find((student: { id: number }) => student.id === 3).submissions[0].grade).toBe(0);
    expect(JSON.stringify(book.body)).not.toContain('file_path');
    expect((await call('get', `/classes/${classId}/gradebook`, 3)).status).toBe(403);
    const todo = await call('get', '/me/todo', 3);
    expect(todo.body.data.items.find((item: { assignment: { id: number } }) => item.assignment.id === assignmentId).status).toBe('graded');
    expect((await call('get', '/me/todo', 2)).status).toBe(403);
  });

  it('rejects invalid assignment inputs and cross-origin writes', async () => {
    for (const body of [{ title: '' }, { title: 'Task', max_points: 0 }, { title: 'Task', max_points: 10000 }, { title: 'Task', due_at: '2026-11-16T10:00' }, { title: 'Task', class_id: 1 }]) {
      expect((await call('post', `/classes/${classId}/assignments`, 2).send(body)).status).toBe(400);
    }
    expect((await call('put', `/assignments/${assignmentId}/submission`, 4).send({ answer_text: '' })).status).toBe(400);
    expect((await call('post', `/classes/${classId}/assignments`, 2).set('Origin', 'https://evil.example').send({ title: 'Task' })).status).toBe(403);
    expect((await call('get', '/assignments/abc', 3)).status).toBe(400);
  });

  it('accepts DOCX by actual content, rejects attachment conflicts and deletes assignment files', async () => {
    const created = await call('post', `/classes/${classId}/assignments`, 2).send({ title: 'DOCX cleanup' });
    const id = created.body.data.assignment.id;
    createdAssignments.push(id);
    const docx = await readFile(new URL('./fixtures/minimal.docx', import.meta.url));
    const uploaded = await call('put', `/assignments/${id}/submission`, 4).field('answer_text', '').attach('file', docx, 'คำตอบ.docx');
    expect(uploaded.status).toBe(200);
    expect(uploaded.body.data.submission.original_name).toBe('คำตอบ.docx');
    expect(await readdir(uploadRoot)).toHaveLength(1);
    const conflict = await call('put', `/assignments/${id}/submission`, 4).field('answer_text', 'ขัดกัน').field('remove_file', 'true').attach('file', pdf, 'conflict.pdf');
    expect(conflict.status).toBe(400);
    expect(await readdir(uploadRoot)).toHaveLength(1);
    expect((await call('put', `/assignments/${id}/submission`, 4).send({ answer_text: '', remove_file: true })).status).toBe(400);
    expect((await call('delete', `/assignments/${id}`, 2)).status).toBe(204);
    expect(await readdir(uploadRoot)).toHaveLength(0);
    expect((await call('get', `/submissions/${uploaded.body.data.submission.id}/file`, 4)).status).toBe(404);
  });

  it('denies upload before writing for outsiders, denies removed members downloads and keeps archives readonly', async () => {
    const created = await call('post', `/classes/${classId}/assignments`, 2).send({ title: 'Access fixture' });
    const id = created.body.data.assignment.id;
    createdAssignments.push(id);
    for (const uid of [undefined, 1, 2, 5]) {
      expect((await call('put', `/assignments/${id}/submission`, uid).field('answer_text', 'x').attach('file', pdf, 'denied.pdf')).status).toBe(uid ? 403 : 401);
      expect(await readdir(uploadRoot)).toHaveLength(0);
    }
    const uploaded = await call('put', `/assignments/${id}/submission`, 4).field('answer_text', 'ก่อนออกห้อง').attach('file', pdf, 'access.pdf');
    expect(uploaded.status).toBe(200);
    const submissionId = uploaded.body.data.submission.id;
    const [filename] = await readdir(uploadRoot);
    expect((await call('get', `/uploads/${filename}`, 4)).status).toBe(404);
    await pool.execute('DELETE FROM class_members WHERE class_id = ? AND user_id = ?', [classId, 4]);
    expect((await call('get', `/submissions/${submissionId}/file`, 4)).status).toBe(403);
    await pool.execute('INSERT INTO class_members (class_id, user_id) VALUES (?, ?)', [classId, 4]);
    await pool.execute('UPDATE classes SET archived = ? WHERE id = ?', [1, classId]);
    expect((await call('put', `/assignments/${id}/submission`, 4).field('answer_text', 'x').attach('file', pdf, 'archive.pdf')).status).toBe(409);
    expect((await call('patch', `/submissions/${submissionId}/grade`, 2).send({ grade: 10 })).status).toBe(409);
    expect((await call('delete', `/assignments/${id}`, 2)).status).toBe(409);
    expect((await call('get', `/submissions/${submissionId}/file`, 4)).status).toBe(200);
    expect(await readdir(uploadRoot)).toHaveLength(1);
    await pool.execute('UPDATE classes SET archived = ? WHERE id = ?', [0, classId]);
    expect((await call('delete', `/assignments/${id}`, 2)).status).toBe(204);
    expect(await readdir(uploadRoot)).toHaveLength(0);
  });
});
