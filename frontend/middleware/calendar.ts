export default defineNuxtRouteMiddleware(() => {
  const { user } = useAuth();
  if (!user.value) return navigateTo('/login');
  if (!['teacher', 'student'].includes(user.value.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden', message: 'ปฏิทินงานสำหรับครูและนักเรียนเท่านั้น' });
  }
});
