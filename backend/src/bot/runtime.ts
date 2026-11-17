import { Bot } from 'grammy';
import type { Config } from '../config.js';
import type { AssignmentStore } from '../assignments.js';
import type { ClassStore } from '../classrooms.js';
import type { UserStore } from '../types.js';
import type { TelegramIntegration, TelegramStore } from '../telegram.js';
import { createNotifications } from '../services/notify.js';
import { telegramWebhook } from '../routes/telegram.js';
import { configureStudentBot, createTelegramSend } from './telegram.js';

export function createTelegramRuntime(config: Config, store: TelegramStore, users: UserStore, assignments: AssignmentStore, classes: ClassStore, suppliedBot?: Bot) {
  const configured = !!(config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_BOT_USERNAME);
  const bot = configured ? suppliedBot ?? new Bot(config.TELEGRAM_BOT_TOKEN, { client: { timeoutSeconds: 10 } }) : null;
  const send = bot ? createTelegramSend(bot) : null;
  const integration: TelegramIntegration = {
    store, configured, username: config.TELEGRAM_BOT_USERNAME,
    hooks: createNotifications(store, assignments, classes, send, config.WEB_URL),
  };
  if (bot && send) {
    configureStudentBot(bot, store, users, assignments, classes, config.WEB_URL, send);
    bot.catch(() => console.error('Telegram update processing failed'));
    if (config.TELEGRAM_MODE === 'webhook') integration.webhook = telegramWebhook(config.TELEGRAM_WEBHOOK_SECRET, update => bot.handleUpdate(update));
  }
  return {
    integration,
    async start() {
      if (!bot) { console.info('Telegram disabled: configure bot credentials to enable it'); return; }
      try {
        await bot.init();
        if (bot.botInfo.username.toLowerCase() !== config.TELEGRAM_BOT_USERNAME.toLowerCase()) throw new Error('Bot username mismatch');
        await bot.api.setMyCommands([
          { command: 'tasks', description: 'ดูงานของฉัน' }, { command: 'grades', description: 'ดูคะแนน' },
          { command: 'classes', description: 'ดูห้องเรียน' }, { command: 'mute', description: 'พักการแจ้งเตือน' },
          { command: 'unmute', description: 'เปิดการแจ้งเตือน' },
        ]);
        if (config.TELEGRAM_MODE === 'webhook') {
          await bot.api.setWebhook(`${config.WEB_URL}/api/telegram/webhook`, { secret_token: config.TELEGRAM_WEBHOOK_SECRET, allowed_updates: ['message'], max_connections: 1 });
        } else {
          await bot.api.deleteWebhook();
          void bot.start({ allowed_updates: ['message'] }).catch(() => console.error('Telegram polling stopped; check connection and restart API'));
        }
      } catch { throw new Error('Telegram startup failed. Check bot credentials, username, network and webhook settings.'); }
    },
    async stop() { if (bot?.isRunning()) await bot.stop(); },
  };
}
