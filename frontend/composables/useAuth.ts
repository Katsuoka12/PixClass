import type { ApiResponse, AuthData, LoginInput, RegisterInput, User } from '~/types/api';

export function useAuth() {
  const user = useState<User | null>('auth-user', () => null);
  const api = useApi();

  async function refresh() {
    try {
      const response = await api<ApiResponse<AuthData>>('/auth/me');
      user.value = response.data.user;
    } catch (error) {
      if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 401) {
        user.value = null;
      } else {
        throw createError({ statusCode: 503, statusMessage: 'Service unavailable', message: 'เชื่อมต่อระบบไม่ได้ กรุณาลองใหม่อีกครั้ง' });
      }
    }
  }

  async function login(input: LoginInput) {
    const response = await api<ApiResponse<AuthData>>('/auth/login', { method: 'POST', body: input });
    user.value = response.data.user;
  }

  async function register(input: RegisterInput) {
    const response = await api<ApiResponse<AuthData>>('/auth/register', { method: 'POST', body: input });
    user.value = response.data.user;
  }

  async function logout() {
    await api('/auth/logout', { method: 'POST', body: {} });
    user.value = null;
    await navigateTo('/login');
  }

  return { user, refresh, login, register, logout };
}
