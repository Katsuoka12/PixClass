import cron from 'node-cron';

export function createReminderRuntime(enabled: boolean, run: () => Promise<void>, schedule: typeof cron.schedule = cron.schedule) {
  let pending: Promise<void> | null = null;
  let stopped = false;
  const invoke = (): Promise<void> => {
    if (stopped) return Promise.resolve();
    if (pending) return pending;
    pending = Promise.resolve().then(run).catch(() => { console.error('Scheduled reminders failed'); }).finally(() => { pending = null; });
    return pending;
  };
  const task = enabled ? schedule('* * * * *', invoke, { name: 'student-tag-due-reminders', timezone: 'Asia/Bangkok', noOverlap: true }) : null;
  if (enabled) void invoke();
  return {
    async stop() {
      stopped = true;
      await task?.stop();
      await pending;
      await task?.destroy();
    },
  };
}
