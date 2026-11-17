import type { ApiResponse, LiveSession, LiveEntry, LiveAttendance, ReminderResult } from '~/types/api';

export function useLive() {
  const api = useApi();
  return {
    list: (classId: number) => api<ApiResponse<{ sessions: LiveSession[] }>>(`/classes/${classId}/live`),
    start: (classId: number, title: string) => api<ApiResponse<{ session: LiveSession }>>(`/classes/${classId}/live/start`, { method: 'POST', body: { title } }),
    link: (id: number) => api<ApiResponse<{ url: string; expires_at: string }>>(`/live/${id}/link`, { method: 'POST', body: {} }),
    join: (token: string) => api<ApiResponse<LiveEntry>>('/live/join', { query: { t: token }, headers: { 'X-Live-Join': '1' } }),
    leave: (id: number) => api<void>(`/live/${id}/leave`, { method: 'POST', body: {} }),
    end: (id: number) => api<ApiResponse<{ session: LiveSession }>>(`/live/${id}/end`, { method: 'POST', body: {} }),
    attendance: (id: number) => api<ApiResponse<LiveAttendance>>(`/live/${id}/attendance`),
    remindAbsent: (id: number) => api<ApiResponse<ReminderResult>>(`/live/${id}/remind-absent`, { method: 'POST', body: {}, timeout: 120000 }),
  };
}
