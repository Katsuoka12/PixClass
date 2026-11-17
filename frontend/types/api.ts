export type Role = 'admin' | 'teacher' | 'student';
export interface User { id: number; role: Role; name: string; email: string }
export interface ApiResponse<T> { data: T }
export interface ApiErrorResponse { error: { code: string; message: string } }
export interface LoginInput { email: string; password: string }
export interface RegisterInput extends LoginInput { name: string }
export interface AuthData { user: User }
export interface OverviewData extends AuthData { milestone: 'M4' }
export interface Classroom {
  id: number; teacher_id: number; teacher_name: string; name: string; section: string;
  join_code?: string; archived: boolean; member_count: number; created_at: string;
}
export interface ClassMember { id: number; name: string; joined_at: string }
export interface Announcement { id: number; class_id: number; author_id: number; author_name: string; body: string; created_at: string }
export interface ClassData { class: Classroom }
export interface ClassesData { classes: Classroom[] }
export interface MembersData { teacher: { id: number; name: string }; members: ClassMember[] }
export interface AnnouncementsData { announcements: Announcement[] }
export interface Assignment {
  id: number; class_id: number; class_name: string; class_archived: boolean;
  title: string; description: string; due_at: string | null; max_points: number;
  allow_late: boolean; created_at: string;
}
export interface AssignmentInput { title: string; description: string; due_at: string | null; max_points: number; allow_late: boolean }
export interface PublicSubmission {
  id: number; assignment_id: number; student_id: number; answer_text: string;
  file_url: string | null; original_name: string | null; submitted_at: string;
  grade: number | null; feedback: string | null; graded_at: string | null; is_late: boolean;
}
export interface SubmissionRow { student_id: number; student_name: string; status: 'missing' | 'submitted' | 'late'; submission: PublicSubmission | null }
export interface Gradebook { assignments: Assignment[]; students: { id: number; name: string; submissions: PublicSubmission[] }[] }
export interface TodoRow { assignment: Assignment; submission: PublicSubmission | null; status: 'missing' | 'submitted' | 'late' | 'graded' }
export interface TelegramStatus { configured: boolean; connected: boolean; muted: boolean }
export interface TelegramLink { url: string; expires_at: string }
export interface ReminderResult { total: number; sent: number; unlinked: number; muted: number; failed: number; skipped: number }
