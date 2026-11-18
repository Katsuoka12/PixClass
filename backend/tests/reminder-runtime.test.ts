import { describe, expect, it, vi } from 'vitest';
import type cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import { createReminderRuntime } from '../src/jobs/runtime.js';
describe('M6 scheduler lifecycle', () => {
  it('does not schedule or reserve reminders while Telegram is disabled', async () => {
    const schedule = vi.fn<typeof cron.schedule>();
    const run = vi.fn(async () => {});
    const runtime = createReminderRuntime(false, run, schedule);
    await runtime.stop();
    expect(schedule).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });
  it('runs on startup, avoids overlap, and waits for the in-flight job on shutdown', async () => {
    let finish!: () => void;
    const deferred = new Promise<void>(resolve => { finish = resolve; });
    const run = vi.fn(async () => deferred);
    const task = { stop: vi.fn(), destroy: vi.fn() } as unknown as ScheduledTask;
    const schedule = vi.fn<typeof cron.schedule>(() => task);
    const runtime = createReminderRuntime(true, run, schedule);
    await Promise.resolve();
    expect(schedule).toHaveBeenCalledWith('* * * * *', expect.any(Function), expect.objectContaining({ timezone: 'Asia/Bangkok', noOverlap: true }));
    const tick = schedule.mock.calls[0]![1];
    if (typeof tick !== 'function') throw new Error('Expected in-process cron function');
    const overlapping = tick({ date: new Date(), dateLocalIso: '', triggeredAt: new Date() });
    expect(run).toHaveBeenCalledTimes(1);
    let stopped = false;
    const stopping = runtime.stop().then(() => { stopped = true; });
    await Promise.resolve();
    expect(stopped).toBe(false);
    finish();
    await overlapping;
    await stopping;
    expect(task.stop).toHaveBeenCalled();
    expect(task.destroy).toHaveBeenCalled();
    await tick({ date: new Date(), dateLocalIso: '', triggeredAt: new Date() });
    expect(run).toHaveBeenCalledTimes(1);
  });
});
