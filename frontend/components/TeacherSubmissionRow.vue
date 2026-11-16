<script setup lang="ts">
import type { PublicSubmission, SubmissionRow } from '~/types/api';
const props = defineProps<{ row: SubmissionRow; maxPoints: number; readonly: boolean }>();
const emit = defineEmits<{ graded: [submission: PublicSubmission] }>();
const assignments = useAssignments();
const grade = ref<number | string>(props.row.submission?.grade ?? '');
const feedback = ref(props.row.submission?.feedback || '');
const pending = ref(false);
const error = ref('');
const success = ref('');
watch(() => props.row.submission, (value) => { grade.value = value?.grade ?? ''; feedback.value = value?.feedback || ''; });
async function save() {
  if (pending.value || !props.row.submission) return;
  error.value = '';
  success.value = '';
  if (grade.value === '' || !Number.isFinite(Number(grade.value))) { error.value = 'กรุณาระบุคะแนน'; return; }
  pending.value = true;
  try {
    const result = await assignments.grade(props.row.submission.id, { grade: Number(grade.value), feedback: feedback.value });
    emit('graded', result.data.submission);
    success.value = 'บันทึกคะแนนเรียบร้อยแล้ว';
  } catch (cause) { error.value = apiErrorMessage(cause); }
  finally { pending.value = false; }
}
</script>

<template>
  <article class="content-card teacher-submission">
    <div class="section-heading"><h3>{{ row.student_name }}</h3><span class="submission-badge" :class="{ late: row.status === 'late', missing: row.status === 'missing' }">{{ assignmentStatus(row.status) }}{{ row.submission?.grade != null ? ' · ตรวจแล้ว' : '' }}</span></div>
    <template v-if="row.submission">
      <p class="muted">ส่งเมื่อ {{ classroomDate(row.submission.submitted_at) }}</p><p v-if="row.submission.answer_text" class="plain-text submitted-answer">{{ row.submission.answer_text }}</p><a v-if="row.submission.file_url" :href="row.submission.file_url" class="attachment-link">ดาวน์โหลด · {{ row.submission.original_name || 'ไฟล์แนบ' }}</a>
      <form v-if="!readonly" class="grading-form" @submit.prevent="save"><div class="field"><label :for="`grade-${row.student_id}`">คะแนน / {{ maxPoints }}</label><input :id="`grade-${row.student_id}`" v-model="grade" type="number" required min="0" :max="maxPoints" step="0.01" :disabled="pending"></div><div class="field"><label :for="`feedback-${row.student_id}`">ความคิดเห็นถึงนักเรียน</label><textarea :id="`feedback-${row.student_id}`" v-model="feedback" maxlength="5000" rows="3" :disabled="pending" /></div><p v-if="error" class="error-message" role="alert">{{ error }}</p><p v-if="success" class="success-message" role="status">{{ success }}</p><button class="button primary" :disabled="pending">{{ pending ? 'กำลังบันทึก…' : row.submission.grade != null ? 'บันทึกคะแนนใหม่' : 'บันทึกคะแนน' }}</button></form>
      <div v-else class="grade-result"><p>คะแนน: {{ row.submission.grade ?? 'ยังไม่ตรวจ' }}{{ row.submission.grade != null ? ` / ${maxPoints}` : '' }}</p><p v-if="row.submission.feedback" class="plain-text">{{ row.submission.feedback }}</p></div>
    </template>
    <p v-else class="muted">นักเรียนยังไม่ได้ส่งงาน</p>
  </article>
</template>
