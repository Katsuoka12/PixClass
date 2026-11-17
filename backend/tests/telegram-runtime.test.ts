import { Bot } from 'grammy';
import { describe, expect, it, vi } from 'vitest';
import { configSchema } from '../src/config.js';
import { createTelegramRuntime } from '../src/bot/runtime.js';
import type { TelegramStore } from '../src/telegram.js';
import type { UserStore } from '../src/types.js';
import type { AssignmentStore } from '../src/assignments.js';
import type { ClassStore } from '../src/classrooms.js';

const base = { WEB_URL: 'https://school.example', JWT_SECRET: 'secret-at-least-32-characters-long-value', TELEGRAM_BOT_TOKEN: `999:${'a'.repeat(35)}`, TELEGRAM_BOT_USERNAME: 'student_tag_test_bot' };
const info = { id: 999, is_bot: true as const, first_name: 'Test', username: base.TELEGRAM_BOT_USERNAME, can_join_groups: false, can_read_all_group_messages: false, supports_inline_queries: false, can_connect_to_business: false, has_main_web_app: false, has_topics_enabled: false, allows_users_to_create_topics: false, can_manage_bots: false, supports_join_request_queries: false };
function runtime(mode: 'polling' | 'webhook') {
  const bot = new Bot(base.TELEGRAM_BOT_TOKEN, { botInfo: info });
  const setWebhook = vi.spyOn(bot.api, 'setWebhook').mockResolvedValue(true);
  const deleteWebhook = vi.spyOn(bot.api, 'deleteWebhook').mockResolvedValue(true);
  vi.spyOn(bot.api, 'setMyCommands').mockResolvedValue(true);
  const pollingStart = vi.spyOn(bot, 'start').mockResolvedValue();
  const config = configSchema.parse({ ...base, TELEGRAM_MODE: mode, TELEGRAM_WEBHOOK_SECRET: 'x'.repeat(32) });
  const result = createTelegramRuntime(config, {} as TelegramStore, {} as UserStore, {} as AssignmentStore, {} as ClassStore, bot);
  return { ...result, bot, setWebhook, deleteWebhook, pollingStart };
}
describe('Telegram deployment configuration', () => {
  it('requires paired credentials and secure webhook settings but allows disabled bots', () => {
    expect(configSchema.safeParse({ WEB_URL: base.WEB_URL, JWT_SECRET: base.JWT_SECRET }).success).toBe(true);
    expect(configSchema.safeParse({ ...base, TELEGRAM_BOT_USERNAME: '' }).success).toBe(false);
    expect(configSchema.safeParse({ ...base, TELEGRAM_MODE: 'webhook' }).success).toBe(false);
    expect(configSchema.safeParse({ ...base, TELEGRAM_MODE: 'webhook', TELEGRAM_WEBHOOK_SECRET: 'x'.repeat(32), WEB_URL: 'http://localhost:3000' }).success).toBe(false);
  });
  it('removes webhook before polling without dropping pending messages', async () => {
    const r = runtime('polling');
    await r.start();
    expect(r.deleteWebhook).toHaveBeenCalledWith();
    expect(r.pollingStart).toHaveBeenCalledWith({ allowed_updates: ['message'] });
    expect(r.setWebhook).not.toHaveBeenCalled();
    expect(r.integration.webhook).toBeUndefined();
  });
  it('registers secret-protected HTTPS webhook and never starts polling', async () => {
    const r = runtime('webhook');
    await r.start();
    expect(r.setWebhook).toHaveBeenCalledWith('https://school.example/api/telegram/webhook', { secret_token: 'x'.repeat(32), allowed_updates: ['message'], max_connections: 1 });
    expect(r.pollingStart).not.toHaveBeenCalled();
    expect(r.integration.webhook).toBeTypeOf('function');
  });
});
