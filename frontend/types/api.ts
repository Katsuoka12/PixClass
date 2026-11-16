export type Role = 'admin' | 'teacher' | 'student';
export interface User { id: number; role: Role; name: string; email: string }
export interface ApiResponse<T> { data: T }
export interface ApiErrorResponse { error: { code: string; message: string } }
export interface LoginInput { email: string; password: string }
export interface RegisterInput extends LoginInput { name: string }
export interface AuthData { user: User }
export interface OverviewData extends AuthData { milestone: 'M1' }
