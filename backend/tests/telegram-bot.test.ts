import { Bot } from 'grammy';
import type { Update } from 'grammy/types';
import { describe, expect, it, vi } from 'vitest';
import { configureStudentBot, createTelegramSend } from '../src/bot/telegram.js';
import type { TelegramStore } from '../src/telegram.js';
import type { AssignmentStore } from '../src/assignments.js';
import type { ClassStore } from '../src/classrooms.js';
import type { UserStore } from '../src/types.js';

const info = { id: 999, is_bot: true as const, first_name: 'Test', username: 'student_tag_test_bot', can_join_groups: false, can_read_all_group_messages: false, supports_inline_queries: false, can_connect_to_business: false, has_main_web_app: false, has_topics_enabled: false, allows_users_to_create_topics: false, can_manage_bots: false, supports_join_request_queries: false };
function setup() {
  const bot = new Bot('999:TEST_ONLY_FAKE_TOKEN', { botInfo: info });
  const payloads: { text: string; chat_id: number; parse_mode?: string; reply_markup?: unknown }[] = [];
  bot.api.config.use(async (_prev, method, payload) => {
    if (method !== 'sendMessage') throw new Error('Unexpected method');
    payloads.push(payload as typeof payloads[number]);
    return { ok: true, result: { message_id: 1, date: 0, chat: { id: 123, type: 'private', first_name: 'Test' }, text: '' } } as never;
  });
  const account = { id: 3, role: 'student' as const, name: 'นักเรียน', is_active: 1, chat_id: 123, muted: false };
  const store: TelegramStore = { account: vi.fn(), byChat: vi.fn(async () => account), issueLink: vi.fn(), link: vi.fn(), mute: vi.fn(), log: vi.fn(), recipients: vi.fn(), eligible: vi.fn() };
  const users: UserStore = { findById: vi.fn(async () => ({ id: 3, role: 'student' as const, name: 'นักเรียน', email: '', password_hash: '', is_active: 1 })), findByEmail: vi.fn(), create: vi.fn() };
  const assignments = { todo: vi.fn(async () => [{ assignment: { id: 4, title: '<b>literal</b>', class_name: 'วิทย์', max_points: 100 }, status: 'graded', submission: { grade: 0 } }]) } as unknown as AssignmentStore;
  const classes = { list: vi.fn(async () => [{ name: 'วิทย์', archived: false }]) } as unknown as ClassStore;
  configureStudentBot(bot, store, users, assignments, classes, 'https://school.example', createTelegramSend(bot, async () => {}));
  let seq = 0;
  const update = (text: string, privateChat = true): Update => ({ update_id: ++seq, message: { message_id: seq, date: 0, from: { id: 123, is_bot: false, first_name: 'Test' }, chat: privateChat ? { id: 123, type: 'private', first_name: 'Test' } : { id: -123, type: 'group', title: 'Group' }, text, entities: [{ type: 'bot_command', offset: 0, length: text.split(' ')[0]!.length }] } });
  return { bot, store, payloads, update, assignments };
}
describe('grammy private commands with simulated transport', () => {
  it('links /start token in private chats and ignores groups', async () => {
    const f = setup();
    await f.bot.handleUpdate(f.update(`/start ${'a'.repeat(32)}`, false));
    expect(f.store.link).not.toHaveBeenCalled();
    await f.bot.handleUpdate(f.update(`/start ${'a'.repeat(32)}`));
    expect(f.store.link).toHaveBeenCalledWith('a'.repeat(32), 123);
    expect(f.payloads.at(-1)?.text).toContain('เชื่อม');
  });
  it('rejects malformed/expired tokens without echoing secrets', async () => {
    const f = setup();
    vi.mocked(f.store.link).mockRejectedValue(new Error('LEAK_TOKEN'));
    await f.bot.handleUpdate(f.update('/start invalid-secret'));
    expect(f.store.link).not.toHaveBeenCalled();
    await f.bot.handleUpdate(f.update(`/start ${'b'.repeat(32)}`));
    expect(JSON.stringify(f.payloads)).not.toContain('LEAK_TOKEN');
    expect(JSON.stringify(f.payloads)).not.toContain('invalid-secret');
  });
  it('returns current user tasks, zero grades, classes and mute/unmute', async () => {
    const f = setup();
    for (const command of ['/tasks', '/grades', '/classes', '/mute', '/unmute']) await f.bot.handleUpdate(f.update(command));
    expect(f.assignments.todo).toHaveBeenCalledTimes(2);
    expect(f.payloads.some(p => p.text.includes('0 / 100'))).toBe(true);
    expect(f.payloads.some(p => p.text.includes('<b>literal</b>'))).toBe(true);
    expect(f.payloads.every(p => !p.parse_mode && p.text.length <= 4000)).toBe(true);
    expect(f.store.mute).toHaveBeenCalledWith(3, true);
    expect(f.store.mute).toHaveBeenCalledWith(3, false);
  });
  it('does not expose data to unlinked chats', async () => {
    const f = setup();
    vi.mocked(f.store.byChat).mockResolvedValue(null);
    await f.bot.handleUpdate(f.update('/grades'));
    expect(f.assignments.todo).not.toHaveBeenCalled();
    expect(f.payloads[0]?.text).toContain('เชื่อม');
  });
  it('serializes concurrent sends and spaces both global and same-chat messages', async () => {
    const f = setup();
    const waits: number[] = [];
    let now = 1000;
    const send = createTelegramSend(f.bot, async ms => { waits.push(ms); now += ms; }, () => now);
    await Promise.all([send(1, 'one'), send(2, 'two'), send(1, 'three')]);
    expect(f.payloads.map(p => p.text)).toEqual(['one', 'two', 'three']);
    expect(waits).toEqual([50, 950]);
  });
  it('honors retry_after without replaying the failed message or breaking the queue', async () => {
    const f = setup();
    let first = true;
    f.bot.api.config.use(async (previous, method, payload, signal) => {
      if (first) { first = false; return { ok: false, error_code: 429, description: 'Too Many Requests', parameters: { retry_after: 2 } } as never; }
      return previous(method, payload, signal);
    });
    let now = 1000;
    const waits: number[] = [];
    const send = createTelegramSend(f.bot, async ms => { waits.push(ms); now += ms; }, () => now);
    await expect(send(1, 'limited')).rejects.toMatchObject({ error_code: 429 });
    await send(2, 'next');
    expect(waits).toEqual([2000]);
    expect(f.payloads.map(p => p.text)).toEqual(['next']);
  });
});
