export function validMonth(value: unknown): value is string {
  return typeof value === 'string' && /^(?:20\d{2}|2100)-(?:0[1-9]|1[0-2])$/.test(value);
}

export function bangkokDate(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp + 7 * 60 * 60 * 1000).toISOString().slice(0, 10) : null;
}

export function currentBangkokMonth(now: Date = new Date()): string {
  return new Date(now.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 7);
}

export function shiftMonth(month: string, direction: -1 | 1): string | null {
  if (!validMonth(month) || (direction !== -1 && direction !== 1)) return null;
  const [year, number] = month.split('-').map(Number) as [number, number];
  const next = new Date(Date.UTC(year, number - 1 + direction, 1)).toISOString().slice(0, 7);
  return validMonth(next) ? next : null;
}

export function calendarDays(month: string): (string | null)[] {
  if (!validMonth(month)) return [];
  const [year, number] = month.split('-').map(Number) as [number, number];
  const offset = new Date(Date.UTC(year, number - 1, 1)).getUTCDay();
  const count = new Date(Date.UTC(year, number, 0)).getUTCDate();
  const days: (string | null)[] = Array.from({ length: offset }, () => null);
  for (let day = 1; day <= count; day++) days.push(`${month}-${String(day).padStart(2, '0')}`);
  while (days.length % 7) days.push(null);
  return days;
}
