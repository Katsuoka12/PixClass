export default defineNuxtRouteMiddleware(async (to) => {
  const auth = useAuth();
  // Recheck status on navigation; never trust a role cached in the browser.
  await auth.refresh();
  const isPublic = ['/login', '/register'].includes(to.path);
  if (!auth.user.value && !isPublic) {
    const destination = liveRedirect(to.fullPath);
    return navigateTo(destination ? { path: '/login', query: { redirect: destination } } : '/login');
  }
  if (auth.user.value && isPublic) return navigateTo(liveRedirect(to.query.redirect) ?? `/${auth.user.value.role}`);
});
