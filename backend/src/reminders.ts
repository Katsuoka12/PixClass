import type { NotificationRecord } from './telegram.js';
export interface DueReminder { assignment_id: number; class_id: number; class_name: string; title: string; due_at: string; user_id: number; window: '24h' | '3h' }
export interface ReminderLease {
  candidates(): Promise<DueReminder[]>;
  claim(item: DueReminder): Promise<number | null>;
  eligible(item: DueReminder): Promise<boolean>;
  complete(logId: number, record: NotificationRecord): Promise<void>;
  release(): Promise<void>;
}
export interface ReminderStore { acquire(): Promise<ReminderLease | null> }
