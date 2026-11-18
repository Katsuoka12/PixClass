import type { ReminderStore } from '../reminders.js';
import type { Notify } from '../services/notify.js';

export async function runDueReminders(store: ReminderStore, notify: Notify, webUrl: string): Promise<void> {
  const lease = await store.acquire();
  if (!lease) return;
  try {
    for (const item of await lease.candidates()) {
      const claim = await lease.claim(item);
      if (claim === null) continue;
      const hours = item.window === '24h' ? 24 : 3;
      const due = new Date(item.due_at).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
      await notify(item.user_id, `เตือนงานใกล้หมดเขต (ภายใน ${hours} ชั่วโมง) · ${item.class_name}\n${item.title}\nกำหนดส่ง ${due}\nคุณยังไม่ได้ส่งงานนี้`, [{ text: 'เปิดงานบนเว็บ', url: `${webUrl}/assignments/${item.assignment_id}` }], {
        kind: `due_${item.window}`, refId: item.assignment_id, classId: item.class_id, missingAssignmentId: item.assignment_id,
        eligible: () => lease.eligible(item), writeLog: record => lease.complete(claim, record),
      });
    }
  } finally { await lease.release(); }
}
