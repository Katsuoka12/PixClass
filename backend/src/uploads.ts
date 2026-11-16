import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import multer from 'multer';
import { fileTypeFromFile } from 'file-type';
import { ApiError } from './middleware/errors.js';

const allowed: Record<string, string> = {
  '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};
export function originalName(value: string): string {
  // Browsers send UTF-8 filenames; multipart's legacy parameter default is Latin-1.
  if (/[^\x00-\x7f]/.test(value) && Array.from(value).every(char => char.charCodeAt(0) <= 255)) {
    const decoded = Buffer.from(value, 'latin1').toString('utf8');
    if (!decoded.includes('\uFFFD')) value = decoded;
  }
  return Array.from(value.replace(/\\/g, '/').split('/').pop()!.replace(/[\u0000-\u001f\u007f]/g, '').trim()).slice(0, 200).join('') || 'attachment';
}

export function uploadService(directory: string) {
  const root = resolve(directory);
  mkdirSync(root, { recursive: true });
  function path(name: string) {
    if (basename(name) !== name || !/^[a-f0-9]{64}\.(pdf|jpe?g|png|docx)$/.test(name)) {
      throw new ApiError(404, 'FILE_NOT_FOUND', 'ไม่พบไฟล์แนบ');
    }
    return join(root, name);
  }
  async function remove(name: string | null | undefined) {
    if (!name) return;
    try { await unlink(path(name)); }
    catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) console.error('Attachment cleanup failed');
    }
  }
  const parse = multer({
    storage: multer.diskStorage({
      destination: root,
      filename: (_req, file, callback) => callback(null, `${randomBytes(32).toString('hex')}${extname(originalName(file.originalname)).toLowerCase()}`),
    }),
    limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 2, parts: 3, fieldSize: 20_000, fieldNameSize: 50, headerPairs: 100 },
    fileFilter: (_req, file, callback) => {
      if (!allowed[extname(originalName(file.originalname)).toLowerCase()]) callback(new ApiError(400, 'INVALID_FILE', 'รองรับเฉพาะ PDF, JPG, PNG และ DOCX'));
      else callback(null, true);
    },
  }).single('file');
  async function validate(file: Express.Multer.File) {
    let detected: Awaited<ReturnType<typeof fileTypeFromFile>>;
    try { detected = await fileTypeFromFile(file.path); } catch { detected = undefined; }
    const name = originalName(file.originalname);
    if (!detected || detected.mime !== allowed[extname(name).toLowerCase()]) {
      throw new ApiError(400, 'INVALID_FILE', 'ชนิดไฟล์จริงไม่ตรงกับไฟล์ที่อนุญาต');
    }
    return { file_path: file.filename, original_name: name };
  }
  return { parse, validate, remove, path, mime: (name: string) => allowed[extname(name)]! };
}
