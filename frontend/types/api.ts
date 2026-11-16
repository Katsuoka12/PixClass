export type Role = 'admin' | 'teacher' | 'student';
export interface User { id: number; role: Role; name: string; email: string }
export interface ApiResponse<T> { data: T }
export interface ApiErrorResponse { error: { code: string; message: string } }
export interface LoginInput { email: string; password: string }
export interface RegisterInput extends LoginInput { name: string }
export interface AuthData { user: User }
export interface OverviewData extends AuthData { milestone: 'M2' }
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
