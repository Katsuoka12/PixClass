<script setup lang="ts">
import type { Assignment, PublicSubmission, ReminderResult } from '~/types/api';
const props = defineProps<{ assignment: Assignment }>();
const assignments = useAssignments();
const telegram = useTelegram();
const reminding = ref(false);
const reminderError = ref('');
const reminderResult = ref<ReminderResult | null>(null);
const { data, error, status, refresh } = await useAsyncData(() => `submissions-${props.assignment.id}`, () => assignments.submissions(props.assignment.id), { watch: [() => props.assignment.due_at] });
const rows = computed(() => data.value?.data.submissions ?? []);
const counts = computed(() => ({ submitted: rows.value.filter(row => row.status === 'submitted').length, late: rows.value.filter(row => row.status === 'late').length, missing: rows.value.filter(row => row.status === 'missing').length }));
function graded(submission: PublicSubmission) {
  if (!data.value) return;
  data.value = { data: { submissions: rows.value.map(row => row.student_id === submission.student_id ? { ...row, submission, status: submission.is_late ? 'late' as const : 'submitted' as const } : row) } };
}
watch(() => props.assignment.id, () => { reminderError.value = ''; reminderResult.value = null; });
async function remind() {
  reminding.value = true;
  reminderError.value = '';
  reminderResult.value = null;
  try { reminderResult.value = (await telegram.remind(props.assignment.id)).data; }
  catch (cause) { reminderError.value = apiErrorMessage(cause); }
  finally { reminding.value = false; }
}
</script>

<template>
  <section class="teacher-submissions"><div class="section-heading"><div><span class="eyebrow">ติดตามการเรียนรู้</span><h2>การส่งงานของนักเรียน</h2></div><button class="button subtle" :disabled="status === 'pending'" @click="refresh()">โหลดใหม่</button></div>
    <p v-if="status === 'pending'" class="loading-text" role="status">กำลังโหลดรายการส่งงาน…</p><div v-else-if="error" class="error-message" role="alert">{{ apiErrorMessage(error) }}</div>
    <template v-else><div class="submission-summary" aria-label="สรุปการส่งงาน"><span>ส่งแล้ว <strong>{{ counts.submitted }}</strong></span><span>ส่งช้า <strong>{{ counts.late }}</strong></span><span>ยังไม่ส่ง <strong>{{ counts.missing }}</strong></span></div>
      <div class="reminder-actions"><button class="button subtle" :disabled="assignment.class_archived || !counts.missing || reminding" @click="remind">{{ reminding ? 'กำลังส่งข้อความเตือน…' : 'เตือนคนที่ยังไม่ส่ง' }}</button><p class="muted">ส่งผ่าน Telegram เฉพาะนักเรียนที่ยังไม่มีการส่งงาน</p></div>
      <div v-if="reminderResult" class="success-message reminder-result" role="status"><p>ตรวจสอบนักเรียนที่ยังไม่ส่ง {{ reminderResult.total }} คน · ส่งสำเร็จ {{ reminderResult.sent }} คน</p><p>ยังไม่เชื่อม Telegram {{ reminderResult.unlinked }} คน · พักการแจ้งเตือน {{ reminderResult.muted }} คน · ส่งไม่สำเร็จ {{ reminderResult.failed }} คน · ข้าม {{ reminderResult.skipped }} คน</p></div>
      <p v-if="reminderError" class="error-message" role="alert">{{ reminderError }}</p>
      <div v-if="!rows.length" class="content-card empty-state"><h3>ยังไม่มีนักเรียนในห้องเรียน</h3><p>รายการส่งงานจะแสดงเมื่อนักเรียนเข้าร่วมห้อง</p></div><div v-else class="submission-list"><TeacherSubmissionRow v-for="row in rows" :key="row.student_id" :row="row" :max-points="assignment.max_points" :readonly="assignment.class_archived" @graded="graded" /></div></template>
  </section>
</template>
