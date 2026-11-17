import { describe, expect, it, vi } from 'vitest';
import type { TelegramAccount, TelegramStore } from '../src/telegram.js';
import type { AssignmentStore } from '../src/assignments.js';
import type { Submission } from '../src/assignments.js';
import type { ClassStore } from '../src/classrooms.js';
import type { User } from '../src/types.js';
import { createNotifications } from '../src/services/notify.js';

const teacher: User = { id: 2, role: 'teacher', name: 'Teacher', email: '', password_hash: '', is_active: 1 };
function fixture() {
  const accounts: TelegramAccount[] = [
    { id: 3, role: 'student', name: 'A', is_active: 1, chat_id: 103, muted: false },
    { id: 4, role: 'student', name: 'B', is_active: 1, chat_id: null, muted: false },
    { id: 5, role: 'student', name: 'C', is_active: 1, chat_id: 105, muted: true },
    { id: 6, role: 'student', name: 'D', is_active: 1, chat_id: 106, muted: false },
  ];
  const store: TelegramStore = { account: vi.fn(async id => accounts.find(a => a.id === id) ?? null), byChat: vi.fn(), issueLink: vi.fn(), link: vi.fn(), mute: vi.fn(), log: vi.fn(), recipients: vi.fn(async () => [3, 4, 5, 6]), eligible: vi.fn(async () => true) };
  const task = { id: 10, class_id: 1, class_name: 'ห้องเรียน', class_archived: false, title: 'การทดลอง', description: '', due_at: null, max_points: 100, allow_late: true, created_at: '' };
  const assignments = { get: vi.fn(async () => task), file: vi.fn(async () => ({ id: 20, assignment_id: 10, student_id: 3, grade: 0, feedback: 'ดีมาก' })) } as unknown as AssignmentStore;
  const classes = { get: vi.fn(async () => ({ id: 1, name: 'ห้องเรียน', archived: false })) } as unknown as ClassStore;
  const send = vi.fn(async (chat: number) => { if (chat === 106) throw new Error('BOT_SECRET /start TOKEN'); });
  const service = createNotifications(store, assignments, classes, send, 'https://school.example');
  return { accounts, store, assignments, send, service };
}
describe('M4 notification delivery', () => {
  it('rechecks live-session eligibility before queued delivery', async () => {
    const f = fixture();
    expect(await f.service.notify(3, 'live invitation', undefined, { kind: 'live_invite', refId: 10, eligible: async () => false })).toBe('skipped');
    expect(f.send).not.toHaveBeenCalled();
  });
  it('counts missing recipients, skips muted/unlinked and continues past a failed send', async () => {
    const { service, store, send } = fixture();
    expect(await service.remind(10, teacher)).toEqual({ total: 4, sent: 1, unlinked: 1, muted: 1, failed: 1, skipped: 0 });
    expect(store.recipients).toHaveBeenCalledWith(1, 10);
    expect(send).toHaveBeenCalledTimes(2);
    expect(store.log).toHaveBeenCalledTimes(4);
    const logs = JSON.stringify(vi.mocked(store.log).mock.calls);
    expect(logs).not.toContain('BOT_SECRET');
    expect(logs).toContain('TELEGRAM_SEND_FAILED');
    expect(send.mock.calls[0]?.[0]).toBe(103);
  });
  it('rechecks membership/submission before sending each reminder', async () => {
    const { service, store, send } = fixture();
    vi.mocked(store.eligible).mockResolvedValue(false);
    expect((await service.remind(10, teacher)).skipped).toBe(4);
    expect(send).not.toHaveBeenCalled();
  });
  it('notifies task and announcement audiences, but grade only its student including grade zero', async () => {
    const { service, store, send } = fixture();
    await service.assignment(10, teacher);
    await service.announcement(1, '<script>literal text</script>', 30);
    await service.grade({ id: 20, assignment_id: 10, student_id: 3, grade: 0, feedback: 'ดีมาก' } as Submission, teacher);
    expect(store.recipients).toHaveBeenCalledWith(1);
    const calls = vi.mocked(store.log).mock.calls.map(([record]) => record);
    expect(calls.some(record => record.kind === 'grade' && record.userId === 3 && record.text.includes('0 / 100'))).toBe(true);
    expect(send).toHaveBeenCalled();
  });
  it('bounds messages and tolerates logging failure without failing classroom work', async () => {
    const { service, store, send } = fixture();
    vi.mocked(store.log).mockRejectedValue(new Error('DATABASE_PASSWORD'));
    await expect(service.notify(3, 'ก'.repeat(6000))).resolves.toBe('sent');
    const actualCalls = send.mock.calls as unknown as [number, string][];
    expect(actualCalls[0]![1].length).toBeLessThanOrEqual(4000);
  });
  it('checks mute again after the sender waits in its delivery queue', async () => {
    const f = fixture();
    let delivered = false;
    const service = createNotifications(f.store, f.assignments, {} as ClassStore, async (_chat, _text, _buttons, guard) => {
      f.accounts[0]!.muted = true;
      await guard?.();
      delivered = true;
    }, 'https://school.example');
    expect(await service.notify(3, 'queued')).toBe('muted');
    expect(delivered).toBe(false);
    expect(f.store.log).toHaveBeenCalledWith(expect.objectContaining({ status: 'skipped', error: 'MUTED' }));
  });
});
