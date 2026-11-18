import type { ApiResponse, CalendarMonth } from '~/types/api';

export function useCalendar() {
  const api = useApi();
  return { month: (month: string) => api<ApiResponse<CalendarMonth>>('/me/calendar', { query: { month } }) };
}
