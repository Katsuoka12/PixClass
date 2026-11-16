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
</script>

<template>
  <div class="workspace">
    <WorkspaceHeader />
    <main id="main-content" class="dashboard">
      <div class="dashboard-heading"><div><span class="eyebrow">พื้นที่ของ{{ content.role }}</span><h1>สวัสดี, {{ auth.user.value?.name }}</h1><p class="muted">{{ content.title }}</p></div><span class="chapter-label">บทที่ <strong>01</strong><span>เริ่มต้นด้วยกัน</span></span></div>
      <section class="welcome-banner"><div><span class="eyebrow">ยินดีต้อนรับสู่ STUDENT TAG</span><h2>พื้นที่เล็ก ๆ<br>สำหรับการเติบโตที่ยิ่งใหญ่<span class="orange-text">.</span></h2><p>บัญชีของคุณพร้อมใช้งานแล้ว</p></div><div class="growth-art" aria-hidden="true"><span class="growth-circle" /><span class="growth-stem" /><span class="growth-leaf left" /><span class="growth-leaf right" /><span class="growth-ground" /></div></section>
      <ClassroomList v-if="role !== 'admin'" :role="role" />
      <section v-else class="content-card archived-section"><h2>{{ content.section }}</h2><p class="muted">{{ content.description }}</p></section>
    </main><footer class="workspace-footer">STUDENT TAG <span>เรียนรู้ • เชื่อมต่อ • เติบโต</span></footer>
  </div>
</template>
