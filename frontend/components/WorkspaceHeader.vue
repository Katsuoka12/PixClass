<script setup lang="ts">
const auth = useAuth();
const labels = { admin: 'ผู้ดูแลระบบ', teacher: 'ครู', student: 'นักเรียน' };
const pending = ref(false);
const error = ref('');
async function logout() {
  pending.value = true;
  error.value = '';
  try { await auth.logout(); } catch (cause) { error.value = apiErrorMessage(cause); }
  finally { pending.value = false; }
}
</script>
<template>
  <div><header class="topbar"><NuxtLink to="/" class="brand-link" aria-label="Student Tag หน้าแรก"><BrandMark /></NuxtLink><div class="account-actions"><NuxtLink v-if="auth.user.value?.role === 'student'" to="/todo" class="tasks-link">งานของฉัน</NuxtLink><NuxtLink to="/profile" class="tasks-link">โปรไฟล์</NuxtLink><span v-if="auth.user.value" class="role-badge">{{ labels[auth.user.value.role] }}</span><button class="button subtle" :disabled="pending" @click="logout">{{ pending ? 'กำลังออก…' : 'ออกจากระบบ' }}</button></div></header><p v-if="error" class="error-message" role="alert">{{ error }}</p></div>
</template>
