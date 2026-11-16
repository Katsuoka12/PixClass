import type { ApiResponse, ClassData, ClassesData } from '~/types/api';

export function useClassrooms() {
  const api = useApi();
  return {
    list: () => api<ApiResponse<ClassesData>>('/classes'),
    get: (id: number) => api<ApiResponse<ClassData>>(`/classes/${id}`),
    create: (input: { name: string; section: string }) => api<ApiResponse<ClassData>>('/classes', { method: 'POST', body: input }),
    join: (code: string) => api<ApiResponse<ClassData>>('/classes/join', { method: 'POST', body: { code } }),
    update: (id: number, input: { name?: string; section?: string; archived?: true }) => api<ApiResponse<ClassData>>(`/classes/${id}`, { method: 'PATCH', body: input }),
  };
}

export function classroomError(error: { statusCode?: number } | null | undefined): never {
  throw createError({ statusCode: error?.statusCode || 503, message: 'ไม่สามารถเปิดห้องเรียนนี้ได้' });
}

export function classroomDate(value: string): string {
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(value));
}
