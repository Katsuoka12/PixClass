import type { User } from './types.js';
import type { RequestHandler } from 'express';
import type { Submission } from './assignments.js';

export interface TelegramAccount { id: number; role: User['role']; name: string; is_active: number; chat_id: number | null; muted: boolean }
export interface NotificationRecord { userId: number; kind: string; refId: number | null; text: string; status: 'sent' | 'failed' | 'skipped'; error: string | null }
export interface TelegramStore {
  account(userId: number): Promise<TelegramAccount | null>;
  byChat(chatId: number): Promise<TelegramAccount | null>;
  issueLink(userId: number, token: string): Promise<string>;
  link(token: string, chatId: number): Promise<void>;
  mute(userId: number, muted: boolean): Promise<void>;
  log(record: NotificationRecord): Promise<void>;
  recipients(classId: number, assignmentId?: number): Promise<number[]>;
  eligible(userId: number, classId: number, assignmentId?: number): Promise<boolean>;
}
export interface TelegramButton { text: string; url: string }
export interface ReminderResult { total: number; sent: number; unlinked: number; muted: number; failed: number; skipped: number }
export interface NotificationHooks {
  assignment(assignmentId: number, teacher: User): Promise<void>;
  announcement(classId: number, body: string, refId: number): Promise<void>;
  grade(submission: Submission, teacher: User): Promise<void>;
  remind(assignmentId: number, teacher: User): Promise<ReminderResult>;
}
export interface TelegramIntegration {
  store: TelegramStore;
  hooks: NotificationHooks;
  configured: boolean;
  username: string;
  webhook?: RequestHandler;
}
