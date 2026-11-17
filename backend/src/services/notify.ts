import type { AssignmentStore } from '../assignments.js';
import type { ClassStore } from '../classrooms.js';
import { ApiError } from '../middleware/errors.js';
import type { NotificationHooks, ReminderResult, TelegramButton, TelegramStore } from '../telegram.js';

export type TelegramSend = (chatId: number, text: string, buttons?: TelegramButton[], beforeSend?: () => Promise<void>) => Promise<void>;
type Outcome = 'sent' | 'unlinked' | 'muted' | 'failed' | 'skipped';
interface Meta { kind: string; refId: number | null; classId?: number; missingAssignmentId?: number; eligible?: () => Promise<boolean> }
class SkippedDelivery extends Error { constructor(public outcome: Outcome) { super(outcome); } }

export function createNotifications(store: TelegramStore, assignments: AssignmentStore, classes: ClassStore, send: TelegramSend | null, webUrl: string) {
  async function notify(userId: number, text: string, buttons?: TelegramButton[], meta: Meta = { kind: 'message', refId: null }): Promise<Outcome> {
    text = text.slice(0, 3999);
    let outcome: Outcome = 'failed';
    let error: string | null = null;
    try {
      const account = await store.account(userId);
      if (!account?.is_active || (meta.classId !== undefined && !await store.eligible(userId, meta.classId, meta.missingAssignmentId)) || (meta.eligible && !await meta.eligible())) outcome = 'skipped';
      else if (!account.chat_id) outcome = 'unlinked';
      else if (account.muted) outcome = 'muted';
      else if (!send) { outcome = 'skipped'; error = 'TELEGRAM_DISABLED'; }
      else {
        await send(account.chat_id, text, buttons, async () => {
          const current = await store.account(userId);
          if (!current?.is_active || current.chat_id !== account.chat_id || (meta.classId !== undefined && !await store.eligible(userId, meta.classId, meta.missingAssignmentId)) || (meta.eligible && !await meta.eligible())) throw new SkippedDelivery('skipped');
          if (current.muted) throw new SkippedDelivery('muted');
        });
        outcome = 'sent';
      }
    } catch (failure) {
      if (failure instanceof SkippedDelivery) outcome = failure.outcome;
      else error = 'TELEGRAM_SEND_FAILED';
    }
    try {
      await store.log({ userId, text, kind: meta.kind, refId: meta.refId, status: outcome === 'sent' ? 'sent' : outcome === 'failed' ? 'failed' : 'skipped', error: error ?? (outcome === 'sent' ? null : outcome.toUpperCase()) });
    } catch { console.error('Notification log write failed'); }
    return outcome;
  }
  const taskButton = (id: number) => [{ text: 'เปิดงานบนเว็บ', url: `${webUrl}/assignments/${id}` }];
  async function batch(ids: number[], text: string, buttons: TelegramButton[], meta: Meta): Promise<ReminderResult> {
    const result: ReminderResult = { total: ids.length, sent: 0, unlinked: 0, muted: 0, failed: 0, skipped: 0 };
    for (const userId of ids) result[await notify(userId, text, buttons, meta)]++;
    return result;
  }
  const hooks: NotificationHooks = {
    async assignment(id, teacher) {
      const task = await assignments.get(id, teacher);
      if (task.class_archived) return;
      await batch(await store.recipients(task.class_id), `งานใหม่ · ${task.class_name}\n${task.title}\n${task.due_at ? `กำหนดส่ง ${new Date(task.due_at).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}` : 'ไม่มีกำหนดส่ง'}`, taskButton(id), { kind: 'assignment', refId: id, classId: task.class_id });
    },
    async announcement(classId, body, refId) {
      const room = await classes.get(classId);
      if (!room || room.archived) return;
      await batch(await store.recipients(classId), `ประกาศใหม่ · ${room.name}\n${body.slice(0, 3000)}`, [{ text: 'เปิดห้องเรียน', url: `${webUrl}/classes/${classId}/stream` }], { kind: 'announcement', refId, classId });
    },
    async grade(submission, teacher) {
      const task = await assignments.get(submission.assignment_id, teacher);
      if (task.class_archived) return;
      await notify(submission.student_id, `คะแนนออก · ${task.class_name}\n${task.title}\n${submission.grade} / ${task.max_points} คะแนน\n${(submission.feedback ?? '').slice(0, 2500)}`, taskButton(task.id), { kind: 'grade', refId: submission.id, classId: task.class_id });
    },
    async remind(id, teacher) {
      const task = await assignments.get(id, teacher);
      if (task.class_archived) throw new ApiError(409, 'CLASS_ARCHIVED', 'ห้องเรียนนี้ถูกเก็บแล้ว');
      return batch(await store.recipients(task.class_id, id), `เตือนงานที่ยังไม่ส่ง · ${task.class_name}\n${task.title}\nเปิดงานเพื่อตรวจสอบกำหนดส่งและส่งคำตอบ`, taskButton(id), { kind: 'reminder', refId: id, classId: task.class_id, missingAssignmentId: id });
    },
  };
  return { ...hooks, notify };
}

// Delivery runs after the classroom write commits; a failed notification cannot undo it.
export function dispatchNotification(job: (() => Promise<void>) | undefined): void {
  if (job) void Promise.resolve().then(job).catch(() => console.error('Notification dispatch failed'));
}
