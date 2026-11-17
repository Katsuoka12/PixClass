import type { User } from './types.js';
import type { ReminderResult, TelegramButton } from './telegram.js';

export interface LiveSession {
  id: number; class_id: number; class_name: string; class_archived: boolean; title: string;
  scheduled_at: string | null; started_at: string | null; ended_at: string | null; created_by: number;
}
export interface LiveLink { token: string; expires_at: string }
export interface LiveJoin { session: LiveSession; room_name: string; display_name: string }
export interface AttendanceRow { user_id: number; name: string; joined_at: string | null; left_at: string | null }
export interface LiveAttendance { session: LiveSession; students: AttendanceRow[] }
export interface LiveStore {
  list(classId: number, user: User): Promise<LiveSession[]>;
  get(id: number, user: User, teacherOnly?: boolean): Promise<LiveSession>;
  start(classId: number, user: User, title: string): Promise<LiveSession>;
  issueToken(id: number, user: User): Promise<LiveLink>;
  join(token: string, user: User): Promise<LiveJoin>;
  leave(id: number, user: User): Promise<void>;
  end(id: number, user: User): Promise<LiveSession>;
  attendance(id: number, user: User): Promise<LiveAttendance>;
  isAbsent(id: number, userId: number): Promise<boolean>;
}
export type LiveNotify = (userId: number, text: string, buttons?: TelegramButton[], meta?: {
  kind: string; refId: number | null; classId?: number; eligible?: () => Promise<boolean>;
}) => Promise<'sent' | 'unlinked' | 'muted' | 'failed' | 'skipped'>;
export interface LiveNotifications {
  invite(session: LiveSession, teacher: User): Promise<void>;
  remindAbsent(id: number, teacher: User): Promise<ReminderResult>;
}
export interface LiveIntegration { store: LiveStore; notifications: LiveNotifications; domain: string }
