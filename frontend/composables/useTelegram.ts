import type { ApiResponse, ReminderResult, TelegramLink, TelegramStatus } from '~/types/api';

export function useTelegram() {
  const api = useApi();
  return {
    status: () => api<ApiResponse<TelegramStatus>>('/telegram/status'),
    link: () => api<ApiResponse<TelegramLink>>('/telegram/link-token', { method: 'POST', body: {} }),
    remind: (assignmentId: number) => api<ApiResponse<ReminderResult>>(`/assignments/${assignmentId}/remind`, { method: 'POST', body: {}, timeout: 120000 }),
  };
}
