<script setup lang="ts">
import type { ApiResponse, Classroom, MembersData } from '~/types/api';
const props = defineProps<{ classroom: Classroom }>();
const auth = useAuth();
const api = useApi();
const { data, error: loadError, refresh } = await useAsyncData(`people-${props.classroom.id}`, () => api<ApiResponse<MembersData>>(`/classes/${props.classroom.id}/members`));
if (loadError.value || !data.value) classroomError(loadError.value);
const removing = ref<number | null>(null);
const confirmId = ref<number | null>(null);
const error = ref('');
const success = ref('');
async function remove(id: number) {
  if (removing.value) return;
  removing.value = id;
  error.value = '';
  success.value = '';
  try {
    await api(`/classes/${props.classroom.id}/members/${id}`, { method: 'DELETE' });
    await refresh();
    confirmId.value = null;
    success.value = 'นำนักเรียนออกจากห้องเรียนแล้ว';
  } catch (cause) { error.value = apiErrorMessage(cause); }
  finally { removing.value = null; }
}
</script>
<template>
  <section class="people-section content-card"><h2>ครูผู้สอน</h2><div class="person-row"><span class="post-avatar" aria-hidden="true">{{ data?.data.teacher.name.slice(0, 1) }}</span><span>{{ data?.data.teacher.name }}</span><span class="small-label">ครู</span></div><div class="section-heading"><h2>นักเรียน</h2><span class="small-label">{{ data?.data.members.length || 0 }} คน</span></div><p v-if="error" class="error-message" role="alert">{{ error }}</p><p v-if="success" class="success-message" role="status">{{ success }}</p><p v-if="!data?.data.members.length" class="empty-state muted">ยังไม่มีนักเรียนเข้าร่วมห้องเรียน</p>
    <div v-for="member in data?.data.members" :key="member.id" class="person-row"><span class="post-avatar" aria-hidden="true">{{ member.name.slice(0, 1) }}</span><div class="person-details"><span>{{ member.name }}</span><small>เข้าร่วม {{ classroomDate(member.joined_at) }}</small></div><div v-if="auth.user.value?.role === 'teacher' && !classroom.archived" class="member-actions"><template v-if="confirmId === member.id"><span class="small-label">ยืนยันนำออก?</span><button class="button subtle" :disabled="removing !== null" @click="remove(member.id)">{{ removing === member.id ? 'กำลังนำออก…' : 'ยืนยัน' }}</button><button class="button subtle" :disabled="removing !== null" @click="confirmId = null">ยกเลิก</button></template><button v-else class="button subtle" :disabled="removing !== null" :aria-label="`นำ ${member.name} ออกจากห้อง`" @click="confirmId = member.id">นำออก</button></div></div>
  </section>
</template>
