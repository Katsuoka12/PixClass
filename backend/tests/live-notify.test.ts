import { describe, expect, it, vi } from 'vitest';
import { createLiveNotifications } from '../src/services/live-notify.js';
import type { LiveNotify, LiveSession, LiveStore } from '../src/live.js';
import type { TelegramStore } from '../src/telegram.js';
import type { User, UserStore } from '../src/types.js';
const session: LiveSession = { id: 10, class_id: 1, class_name: 'วิทย์', class_archived: false, title: 'เรียนสด', scheduled_at: null, started_at: '2026-11-17T00:00:00Z', ended_at: null, created_by: 2 };
const teacher: User = { id: 2, name: 'ครู', role: 'teacher', email: '', password_hash: '', is_active: 1 };
function fixture() {
  const store = { get: vi.fn(async () => session), issueToken: vi.fn(async (_id: number, user: User) => ({ token: user.id === 3 ? 'a'.repeat(64) : 'b'.repeat(64), expires_at: '' })), attendance: vi.fn(async () => ({ session: { ...session, ended_at: '2026-11-17T01:00:00Z' }, students: [{ user_id: 3, name: 'A', joined_at: '2026-11-17T00:01:00Z', left_at: null }, { user_id: 4, name: 'B', joined_at: null, left_at: null }] })), isAbsent: vi.fn(async () => true) } as unknown as LiveStore;
  const telegram = { recipients: vi.fn(async () => [3, 4]) } as unknown as TelegramStore;
  const users = { findById: vi.fn(async id => ({ ...teacher, id, role: 'student' as const })) } as unknown as UserStore;
  const notify = vi.fn<LiveNotify>(async () => 'sent');
  const service = createLiveNotifications(store, telegram, users, notify, 'https://school.example');
  return { store, notify, service };
}
describe('M5 scoped live notifications', () => {
  it('rejects absence reminders for archived classrooms without sending or logging', async () => {
    const f = fixture();
    vi.mocked(f.store.attendance).mockResolvedValue({ session: { ...session, class_archived: true, ended_at: '2026-11-17T01:00:00Z' }, students: [{ user_id: 4, name: 'B', joined_at: null, left_at: null }] });
    await expect(f.service.remindAbsent(10, teacher)).rejects.toMatchObject({ code: 'CLASS_ARCHIVED' });
    expect(f.notify).not.toHaveBeenCalled();
  });
  it('issues distinct per-student URLs and never includes tokens in logged message text', async () => {
    const f = fixture();
    await f.service.invite(session, teacher);
    expect(f.store.issueToken).toHaveBeenCalledTimes(2);
    const calls = f.notify.mock.calls;
    expect(calls[0]![2]![0]!.url).toBe(`https://school.example/live/join?t=${'a'.repeat(64)}`);
    expect(calls[1]![2]![0]!.url).toBe(`https://school.example/live/join?t=${'b'.repeat(64)}`);
    expect(calls[0]![1]).not.toContain('a'.repeat(64));
    expect(calls[0]![3]?.kind).toBe('live_invite');
  });
  it('reminds only absent students after end and includes accurate delivery counts', async () => {
    const f = fixture();
    expect(await f.service.remindAbsent(10, teacher)).toEqual({ total: 1, sent: 1, unlinked: 0, muted: 0, failed: 0, skipped: 0 });
    expect(f.notify).toHaveBeenCalledWith(4, expect.any(String), expect.any(Array), expect.objectContaining({ kind: 'live_absent' }));
    const guard = f.notify.mock.calls[0]![3]!.eligible!;
    expect(await guard()).toBe(true);
    expect(f.store.isAbsent).toHaveBeenCalledWith(10, 4);
    vi.mocked(f.store.attendance).mockResolvedValue({ session, students: [] });
    await expect(f.service.remindAbsent(10, teacher)).rejects.toMatchObject({ code: 'LIVE_NOT_ENDED' });
  });
  it('skips stale invitations and continues after a token cannot be issued', async () => {
    const f = fixture();
    vi.mocked(f.store.issueToken).mockRejectedValueOnce(new Error('session ended'));
    await f.service.invite(session, teacher);
    expect(f.notify).toHaveBeenCalledTimes(2);
    const guard = f.notify.mock.calls[0]![3]!.eligible!;
    expect(await guard()).toBe(false);
  });
});
