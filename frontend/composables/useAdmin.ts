import type { AdminUser, AdminUsersPage, ApiResponse, TeacherInput } from '~/types/api';

export function useAdmin() {
  const api = useApi();
  return {
    list: (page: number) => api<ApiResponse<AdminUsersPage>>('/admin/users', { query: { page } }),
    createTeacher: (input: TeacherInput) => api<ApiResponse<{ user: AdminUser }>>('/admin/users', { method: 'POST', body: input }),
    setActive: (id: number, active: boolean) => api<ApiResponse<{ user: AdminUser }>>(`/admin/users/${id}`, { method: 'PATCH', body: { is_active: active } }),
  };
}
