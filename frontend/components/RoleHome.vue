<script setup lang="ts">
import type { ApiResponse, OverviewData, Role } from '~/types/api';
const props = defineProps<{ role: Role }>();
const auth = useAuth();
const api = useApi();
const { error: overviewError } = await useAsyncData(`overview-${props.role}`, () => api<ApiResponse<OverviewData>>(`/${props.role}/overview`));
if (overviewError.value) throw createError({ statusCode: overviewError.value.statusCode || 503, message: 'ไม่สามารถเปิดหน้านี้ได้ กรุณาเข้าสู่ระบบอีกครั้ง' });
const content = {
  admin: { role: 'ผู้ดูแลระบบ', title: 'ดูแลพื้นที่แห่งการเรียนรู้', section: 'การจัดการผู้ใช้', description: 'หน้าจัดการบัญชีครูและสถานะผู้ใช้จะเปิดให้ใช้งานในขั้นถัดไป' },
  teacher: { role: 'ครู', title: 'พร้อมส่งต่อความรู้วันนี้', section: 'ห้องเรียนของคุณ', description: 'ระบบสร้างห้องเรียนและโพสต์ประกาศกำลังเตรียมพร้อมสำหรับขั้นถัดไป' },
  student: { role: 'นักเรียน', title: 'วันนี้อยากเรียนรู้อะไรใหม่', section: 'ห้องเรียนของฉัน', description: 'ระบบเข้าร่วมห้องเรียนด้วยรหัสกำลังเตรียมพร้อมสำหรับขั้นถัดไป' },
}[props.role];
const pending = ref(false);
const error = ref('');
async function logout() {
  pending.value = true;
  try { await auth.logout(); } catch (cause) { error.value = apiErrorMessage(cause); }
  finally { pending.value = false; }
}
</script>

<template>
  <div class="workspace">
    <header class="topbar"><NuxtLink to="/" class="brand-link" aria-label="Student Tag หน้าแรก"><BrandMark /></NuxtLink><div class="account-actions"><span class="role-badge">{{ content.role }}</span><button class="button subtle" :disabled="pending" @click="logout">{{ pending ? 'กำลังออก…' : 'ออกจากระบบ' }}</button></div></header>
    <main id="main-content" class="dashboard">
      <p v-if="error" class="error-message" role="alert">{{ error }}</p>
      <div class="dashboard-heading"><div><span class="eyebrow">พื้นที่ของ{{ content.role }}</span><h1>สวัสดี, {{ auth.user.value?.name }}</h1><p class="muted">{{ content.title }}</p></div><span class="chapter-label">บทที่ <strong>01</strong><span>เริ่มต้นด้วยกัน</span></span></div>
      <section class="welcome-banner"><div><span class="eyebrow">ยินดีต้อนรับสู่ STUDENT TAG</span><h2>พื้นที่เล็ก ๆ<br>สำหรับการเติบโตที่ยิ่งใหญ่<span class="orange-text">.</span></h2><p>บัญชีของคุณพร้อมใช้งานแล้ว</p></div><div class="growth-art" aria-hidden="true"><span class="growth-circle" /><span class="growth-stem" /><span class="growth-leaf left" /><span class="growth-leaf right" /><span class="growth-ground" /></div></section>
      <div class="dashboard-grid"><section class="content-card"><div class="section-heading"><h2>{{ content.section }}</h2><span class="small-label">เร็ว ๆ นี้</span></div><div class="empty-state"><span class="empty-icon" aria-hidden="true">↗</span><h3>เตรียมพบกับบทเรียนใหม่</h3><p>{{ content.description }}</p></div></section><aside class="profile-card"><span class="eyebrow">ข้อมูลบัญชี</span><div class="avatar" aria-hidden="true">{{ auth.user.value?.name.slice(0, 1) }}</div><h2>{{ auth.user.value?.name }}</h2><p class="profile-email">{{ auth.user.value?.email }}</p><dl><div><dt>บทบาท</dt><dd>{{ content.role }}</dd></div><div><dt>สถานะบัญชี</dt><dd><span class="status-dot" />ใช้งานได้</dd></div></dl></aside></div>
    </main><footer class="workspace-footer">STUDENT TAG <span>เรียนรู้ • เชื่อมต่อ • เติบโต</span></footer>
  </div>
</template>
