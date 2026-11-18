import { loadConfig } from './config.js';
import { createPool, createUserStore } from './db.js';
import { createApp } from './app.js';
import { createClassStore } from './class-db.js';
import { createAssignmentStore } from './assignment-db.js';
import { createTelegramStore } from './telegram-db.js';
import { createTelegramRuntime } from './bot/runtime.js';
import { createLiveStore } from './live-db.js';
import { createLiveNotifications } from './services/live-notify.js';
import { createAdminStore } from './admin-db.js';
import { createCalendarStore } from './calendar-db.js';
import { createReminderStore } from './reminder-db.js';
import { runDueReminders } from './jobs/reminders.js';
import { createReminderRuntime } from './jobs/runtime.js';

async function main() {
  const config = loadConfig();
  const pool = createPool(config);
  try {
    await pool.execute('SELECT 1');
  } catch {
    await pool.end();
    throw new Error('Cannot connect to MariaDB. Check DB settings and import schema.sql first.');
  }
  const users = createUserStore(pool);
  const classes = createClassStore(pool);
  const assignments = createAssignmentStore(pool);
  const telegramStore = createTelegramStore(pool);
  const telegram = createTelegramRuntime(config, telegramStore, users, assignments, classes);
  const liveStore = createLiveStore(pool);
  const live = { store: liveStore, domain: config.JITSI_DOMAIN, notifications: createLiveNotifications(liveStore, telegramStore, users, telegram.notify, config.WEB_URL) };
  try { await telegram.start(); }
  catch (error) { await pool.end(); throw error; }
  const management = { admin: createAdminStore(pool), calendar: createCalendarStore(pool) };
  const reminderStore = createReminderStore(pool);
  const jobs = createReminderRuntime(telegram.integration.configured, () => runDueReminders(reminderStore, telegram.notify, config.WEB_URL));
  const server = createApp(config, users, classes, assignments, undefined, telegram.integration, live, management).listen(config.API_PORT, '127.0.0.1', () => {
    console.info(`Student Tag API listening on port ${config.API_PORT}`);
  });
  const shutdown = () => {
    const jobsStopped = Promise.allSettled([jobs.stop()]);
    server.close(() => {
      void jobsStopped.then(results => {
        if (results.some(result => result.status === 'rejected')) throw new Error('Job shutdown failed');
        return telegram.stop();
      }).then(() => pool.end()).then(() => process.exit(0))
        .catch(() => { console.error('API shutdown failed'); process.exit(1); });
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'API startup failed');
  process.exitCode = 1;
});
