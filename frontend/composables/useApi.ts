export function useApi() {
  const config = useRuntimeConfig();
  // SSR calls Express directly: Nitro's internal fetch bypasses devProxy.
  return $fetch.create({
    baseURL: import.meta.server ? config.apiServerBase : config.public.apiBase,
    headers: import.meta.server ? useRequestHeaders(['cookie']) : undefined,
    credentials: 'include', retry: 0, timeout: 8000,
  });
}

export function apiErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = error.data as { error?: { message?: unknown } } | undefined;
    if (typeof data?.error?.message === 'string') return data.error.message;
  }
  return 'เชื่อมต่อระบบไม่ได้ กรุณาลองอีกครั้ง';
}
