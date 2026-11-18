import type { Assignment, Submission, TodoRow } from './assignments.js';
import type { User } from './types.js';
export interface CalendarItem { assignment: Assignment; status: TodoRow['status'] | null; submission: Submission | null }
export interface CalendarMonth { month: string; timezone: 'Asia/Bangkok'; items: CalendarItem[] }
export interface CalendarStore { month(month: string, user: User): Promise<CalendarMonth> }
