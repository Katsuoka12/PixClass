<script setup lang="ts">
import type { Announcement, AnnouncementsData, ApiResponse, Classroom } from '~/types/api';
const props = defineProps<{ classroom: Classroom }>();
const api = useApi();
const auth = useAuth();
const { data, error: loadError, refresh } = await useAsyncData(`stream-${props.classroom.id}`, () => api<ApiResponse<AnnouncementsData>>(`/classes/${props.classroom.id}/announcements`));
if (loadError.value || !data.value) classroomError(loadError.value);
const body = ref('');
const pending = ref(false);
const error = ref('');
const success = ref('');
async function post() {
  if (pending.value) return;
  pending.value = true;
  error.value = '';
  success.value = '';
  try {
    await api<ApiResponse<{ announcement: Announcement }>>(`/classes/${props.classroom.id}/announcements`, { method: 'POST', body: { body: body.value } });
    body.value = '';
    await refresh();
    success.value = 'โพสต์ประกาศแล้ว';
  } catch (cause) { error.value = apiErrorMessage(cause); }
  finally { pending.value = false; }
}
</script>
<template>
  <section class="stream-section"><ClassLive :classroom="classroom" /><div class="stream-intro"><h2>สตรีมของห้องเรียน</h2><p class="muted">ประกาศและเรื่องราวจากครูถึงทุกคน</p></div>
    <form v-if="auth.user.value?.role === 'teacher' && !classroom.archived" class="content-card announcement-form" :aria-busy="pending" @submit.prevent="post"><div class="field"><label for="announcement-body">ประกาศถึงนักเรียน</label><textarea id="announcement-body" v-model="body" required maxlength="5000" rows="4" :disabled="pending" placeholder="วันนี้มีอะไรอยากบอกห้องเรียนบ้าง…" /></div><div class="form-actions"><small class="muted">{{ body.length }}/5000</small><button class="button primary" :disabled="pending || !body.trim()">{{ pending ? 'กำลังโพสต์…' : 'โพสต์ประกาศ' }} <span aria-hidden="true">↗</span></button></div><p v-if="error" class="error-message" role="alert">{{ error }}</p></form>
    <p v-if="success" class="success-message" role="status">{{ success }}</p>
    <div v-if="!data?.data.announcements.length" class="empty-state content-card"><span class="empty-icon" aria-hidden="true">↗</span><h3>ยังไม่มีประกาศ</h3><p>ประกาศจากครูจะแสดงที่นี่ เพื่อให้ทุกคนติดตามได้ในที่เดียว</p></div>
    <article v-for="announcement in data?.data.announcements" :key="announcement.id" class="content-card announcement"><header><span class="post-avatar" aria-hidden="true">{{ announcement.author_name.slice(0, 1) }}</span><div><h3>{{ announcement.author_name }}</h3><time :datetime="announcement.created_at">{{ classroomDate(announcement.created_at) }}</time></div><span class="small-label">ประกาศ</span></header><p class="announcement-body">{{ announcement.body }}</p></article>
  </section>
</template>
