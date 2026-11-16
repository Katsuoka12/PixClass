export default defineNuxtRouteMiddleware(async (to) => {
  const auth = useAuth();
  // Recheck status on navigation; never trust a role cached in the browser.
  await auth.refresh();
  const isPublic = ['/login', '/register'].includes(to.path);
  if (!auth.user.value && !isPublic) return navigateTo('/login');
  if (auth.user.value && isPublic) return navigateTo(`/${auth.user.value.role}`);
});
