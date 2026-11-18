import type { Role, User } from './types.js';
export interface AdminUser { id: number; role: Role; name: string; email: string; is_active: boolean; created_at: string }
export interface AdminUsersPage { users: AdminUser[]; total: number; page: number; page_size: number }
export interface AdminStore {
  list(actor: User, page: number): Promise<AdminUsersPage>;
  createTeacher(actor: User, input: { name: string; email: string; password_hash: string }): Promise<AdminUser>;
  setActive(id: number, actor: User, active: boolean): Promise<AdminUser>;
}
