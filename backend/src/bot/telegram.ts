import { setTimeout as delay } from 'node:timers/promises';
import { Bot, GrammyError } from 'grammy';
import type { AssignmentStore } from '../assignments.js';
import type { ClassStore } from '../classrooms.js';
import type { TelegramStore } from '../telegram.js';
import type { UserStore } from '../types.js';
import { ApiError } from '../middleware/errors.js';
import type { TelegramSend } from '../services/notify.js';

export function createTelegramSend(bot: Bot, sleep: (ms: number) => Promise<unknown> = delay, now = Date.now): TelegramSend {
  let pending = Promise.resolve();
  let nextGlobal = 0;
  const nextChat = new Map<number, number>();
  return (chatId, text, buttons, beforeSend) => {
    const job = pending.then(async () => {
      const wait = Math.max(nextGlobal, nextChat.get(chatId) ?? 0) - now();
      if (wait > 0) await sleep(wait);
      await beforeSend?.();
      try {
        await bot.api.sendMessage(chatId, text.slice(0, 3999), {
          link_preview_options: { is_disabled: true },
          ...(buttons?.length ? { reply_markup: { inline_keyboard: [buttons] } } : {}),
        });
      } catch (error) {
        if (error instanceof GrammyError && error.error_code === 429) nextGlobal = now() + Math.max(1, error.parameters.retry_after ?? 1) * 1000;
        throw error;
      } finally {
        nextGlobal = Math.max(nextGlobal, now() + 50);
        nextChat.set(chatId, now() + 1000);
      }
    });
    pending = job.catch(() => {});
    return job;
  };
}

export function configureStudentBot(bot: Bot, store: TelegramStore, users: UserStore, assignments: AssignmentStore, classes: ClassStore, webUrl: string, send = createTelegramSend(bot)): void {
  bot.use(async (ctx, next) => {
    if (ctx.chat?.type !== 'private' || !ctx.from || ctx.from.is_bot || ctx.chat.id !== ctx.from.id) return;
    try { await next(); }
    catch (error) {
      const message = error instanceof ApiError && error.code === 'TELEGRAM_ALREADY_LINKED'
        ? 'บัญชีหรือ Telegram นี้เชื่อมอยู่แล้ว กรุณาติดต่อผู้ดูแลหากต้องการเปลี่ยนบัญชี'
        : 'ดำเนินการไม่ได้ ลิงก์อาจหมดอายุหรือถูกใช้แล้ว กรุณาสร้างลิงก์ใหม่จากหน้าโปรไฟล์';
      try { await send(ctx.chat.id, message); } catch { console.error('Telegram command delivery failed'); }
    }
  });
  bot.command('start', async ctx => {
    if (!/^[a-f0-9]{32}$/.test(ctx.match)) {
      await send(ctx.chat.id, 'เชื่อมบัญชี Student Tag จากหน้าโปรไฟล์บนเว็บก่อน แล้วกดลิงก์เชื่อม Telegram');
      return;
    }
    await store.link(ctx.match, ctx.chat.id);
    await send(ctx.chat.id, 'เชื่อมบัญชี Student Tag สำเร็จแล้ว ✅\n/tasks งานของฉัน\n/grades คะแนน\n/classes ห้องเรียน\n/mute ปิดแจ้งเตือน\n/unmute เปิดแจ้งเตือน');
  });
  for (const command of ['tasks', 'grades', 'classes', 'mute', 'unmute'] as const) {
    bot.command(command, async ctx => {
      const account = await store.byChat(ctx.chat.id);
      const user = account ? await users.findById(account.id) : undefined;
      if (!account || !user?.is_active) {
        await send(ctx.chat.id, 'กรุณาเชื่อมบัญชีที่ใช้งานอยู่จากหน้าโปรไฟล์ Student Tag');
        return;
      }
      if (command === 'mute' || command === 'unmute') {
        await store.mute(user.id, command === 'mute');
        await send(ctx.chat.id, command === 'mute' ? 'ปิดการแจ้งเตือนแล้ว ใช้ /unmute เพื่อเปิดอีกครั้ง' : 'เปิดการแจ้งเตือนแล้ว');
        return;
      }
      let lines: string[];
      let path: string;
      if (command === 'classes') {
        lines = user.role === 'admin' ? [] : (await classes.list(user)).filter(room => !room.archived).map(room => room.name);
        path = '/';
      } else {
        const tasks = user.role === 'student' ? await assignments.todo(user) : [];
        lines = tasks.filter(item => command === 'tasks' ? item.status !== 'graded' : item.submission?.grade != null)
          .map(item => `${item.assignment.class_name} · ${item.assignment.title}${command === 'grades' ? ` — ${item.submission!.grade} / ${item.assignment.max_points}` : ''}`);
        path = user.role === 'student' ? '/todo' : '/';
      }
      const heading = command === 'tasks' ? 'งานของฉัน' : command === 'grades' ? 'คะแนนของฉัน' : 'ห้องเรียนของฉัน';
      await send(ctx.chat.id, `${heading}\n${lines.length ? lines.slice(0, 15).join('\n') : 'ยังไม่มีข้อมูล'}${lines.length > 15 ? '\nดูรายการทั้งหมดบนเว็บ' : ''}`.slice(0, 3999), [{ text: 'เปิด Student Tag', url: `${webUrl}${path}` }]);
    });
  }
}
