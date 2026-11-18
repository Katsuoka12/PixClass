import { describe, expect, it, vi } from 'vitest';
import { runDueReminders } from '../src/jobs/reminders.js';
import type { DueReminder, ReminderLease, ReminderStore } from '../src/reminders.js';
import type { Notify } from '../src/services/notify.js';
const item: DueReminder = { assignment_id: 10, class_id: 1, class_name: 'วิทย์', title: 'งานทดสอบ', due_at: '2026-11-19T00:00:00Z', user_id: 3, window: '24h' };
function fixture() {
  const lease: ReminderLease = { candidates: vi.fn(async () => [item]), claim: vi.fn(async () => 20), eligible: vi.fn(async () => true), complete: vi.fn(), release: vi.fn() };
  const store: ReminderStore = { acquire: vi.fn(async () => lease) };
  const notify = vi.fn<Notify>(async (_id, text, _buttons, meta) => { await meta?.writeLog?.({ userId: 3, kind: meta.kind, refId: 10, text, status: 'sent', error: null }); return 'sent'; });
  return { lease, store, notify };
}
describe('M6 due reminder worker', () => {
  it('claims before sending and updates the reservation through the shared notifier', async () => {
    const f = fixture();
    await runDueReminders(f.store, f.notify, 'https://school.example');
    expect(f.lease.claim).toHaveBeenCalledWith(item);
    expect(f.notify).toHaveBeenCalledWith(3, expect.stringContaining('24'), [{ text: expect.any(String), url: 'https://school.example/assignments/10' }], expect.objectContaining({ kind: 'due_24h', refId: 10, missingAssignmentId: 10 }));
    expect(f.lease.complete).toHaveBeenCalledWith(20, expect.objectContaining({ status: 'sent', kind: 'due_24h' }));
    expect(await f.notify.mock.calls[0]![3]!.eligible!()).toBe(true);
    expect(f.lease.release).toHaveBeenCalledTimes(1);
  });
  it('does not send when the job is locked or already claimed', async () => {
    const f = fixture();
    vi.mocked(f.store.acquire).mockResolvedValueOnce(null);
    await runDueReminders(f.store, f.notify, 'https://school.example');
    expect(f.notify).not.toHaveBeenCalled();
    vi.mocked(f.lease.claim).mockResolvedValue(null);
    await runDueReminders(f.store, f.notify, 'https://school.example');
    expect(f.notify).not.toHaveBeenCalled();
  });
  it('always releases the advisory lock on a failed scan or notifier', async () => {
    const f = fixture();
    vi.mocked(f.lease.candidates).mockRejectedValue(new Error('DB unavailable'));
    await expect(runDueReminders(f.store, f.notify, 'https://school.example')).rejects.toThrow();
    expect(f.lease.release).toHaveBeenCalledTimes(1);
  });
});
