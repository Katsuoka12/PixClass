import type { LiveNotifications, LiveNotify, LiveStore } from '../live.js';
import type { TelegramStore, ReminderResult } from '../telegram.js';
import type { UserStore } from '../types.js';
import { ApiError } from '../middleware/errors.js';

export function createLiveNotifications(store: LiveStore, telegram: TelegramStore, users: UserStore, notify: LiveNotify, webUrl: string): LiveNotifications {
  return {
    async invite(session) {
      const ids = await telegram.recipients(session.class_id);
      for (const id of ids) {
        const user = await users.findById(id);
        let url: string | null = null;
        if (user?.is_active) {
          try { url = `${webUrl}/live/join?t=${(await store.issueToken(session.id, user)).token}`; }
          catch { /* A session may end or membership may change while invitations wait. */ }
        }
        const eligible = async () => {
          if (!user || !url) return false;
          try { const current = await store.get(session.id, user); return !current.ended_at && !current.class_archived; }
          catch { return false; }
        };
        await notify(id, `📹 เข้าเรียน · ${session.class_name}\n${session.title}`, url ? [{ text: '📹 เข้าเรียน', url }] : [], { kind: 'live_invite', refId: session.id, classId: session.class_id, eligible });
      }
    },
    async remindAbsent(id, teacher) {
      const attendance = await store.attendance(id, teacher);
      if (attendance.session.class_archived) throw new ApiError(409, 'CLASS_ARCHIVED', 'ห้องเรียนนี้ถูกเก็บแล้ว');
      if (!attendance.session.ended_at) throw new ApiError(409, 'LIVE_NOT_ENDED', 'กรุณาจบคาบก่อนแจ้งเตือนคนขาด');
      const students = attendance.students.filter(student => !student.joined_at);
      const result: ReminderResult = { total: students.length, sent: 0, unlinked: 0, muted: 0, failed: 0, skipped: 0 };
      for (const student of students) {
        const outcome = await notify(student.user_id, `แจ้งเตือนการขาดเรียน · ${attendance.session.class_name}\nคุณยังไม่มีบันทึกเข้าเรียนคาบ “${attendance.session.title}” กรุณาติดต่อครูผู้สอน`, [{ text: 'เปิดห้องเรียน', url: `${webUrl}/classes/${attendance.session.class_id}/stream` }], { kind: 'live_absent', refId: id, classId: attendance.session.class_id, eligible: () => store.isAbsent(id, student.user_id) });
        result[outcome]++;
      }
      return result;
    },
  };
}
