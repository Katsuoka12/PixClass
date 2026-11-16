export default defineNuxtRouteMiddleware((to) => {
  const { user } = useAuth();
  if (!user.value) return navigateTo('/login');
  if (user.value.role !== to.meta.role) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden', message: 'คุณไม่มีสิทธิ์เข้าถึงหน้านี้' });
  }
});
