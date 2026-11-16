<script setup lang="ts">
import type { Assignment } from '~/types/api';
const props = defineProps<{ assignment: Assignment }>();
const assignments = useAssignments();
const { data, error: loadError, status, refresh } = await useAsyncData(() => `own-submission-${props.assignment.id}`, () => assignments.ownSubmission(props.assignment.id));
const submission = computed(() => data.value?.data.submission ?? null);
const graded = computed(() => submission.value?.grade !== null && submission.value?.grade !== undefined);
const answer = ref(submission.value?.answer_text || '');
const file = ref<File | null>(null);
const removeFile = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const pending = ref(false);
const error = ref('');
const success = ref('');
watch(submission, (value) => { answer.value = value?.answer_text || ''; });
function chooseFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const selected = input.files?.[0] ?? null;
  error.value = '';
  file.value = null;
  if (selected && (selected.size > 10 * 1024 * 1024 || !/\.(pdf|jpe?g|png|docx)$/i.test(selected.name))) {
    error.value = 'กรุณาเลือกไฟล์ PDF, JPG, PNG หรือ DOCX ขนาดไม่เกิน 10 MB';
    input.value = '';
    return;
  }
  file.value = selected;
  if (selected) removeFile.value = false;
}
async function save() {
  if (pending.value) return;
  error.value = '';
  success.value = '';
  if (!answer.value.trim() && !file.value && (!submission.value?.file_url || removeFile.value)) {
    error.value = 'กรุณาเขียนคำตอบหรือแนบไฟล์อย่างน้อยหนึ่งอย่าง';
    return;
  }
  pending.value = true;
  try {
    let body: FormData | { answer_text: string; remove_file: boolean } = { answer_text: answer.value, remove_file: removeFile.value };
    if (file.value) {
      body = new FormData();
      body.append('answer_text', answer.value);
      body.append('file', file.value);
    }
    data.value = await assignments.submit(props.assignment.id, body);
    file.value = null;
    removeFile.value = false;
    if (fileInput.value) fileInput.value.value = '';
    success.value = 'ส่งงานเรียบร้อยแล้ว';
  } catch (cause) { error.value = apiErrorMessage(cause); }
  finally { pending.value = false; }
}
</script>

<template>
  <section class="content-card submission-panel">
    <div class="section-heading"><h2>งานของคุณ</h2><span v-if="submission" class="submission-badge" :class="{ late: submission.is_late }">{{ graded ? 'ตรวจแล้ว' : submission.is_late ? 'ส่งช้า' : 'ส่งแล้ว' }}</span><span v-else class="muted">ยังไม่ส่ง</span></div>
    <p v-if="status === 'pending'" role="status">กำลังโหลดงานของคุณ…</p>
    <div v-else-if="loadError" class="error-message" role="alert"><p>{{ apiErrorMessage(loadError) }}</p><button class="button subtle" @click="refresh()">ลองอีกครั้ง</button></div>
    <template v-else>
      <p v-if="submission" class="muted">ส่งเมื่อ {{ classroomDate(submission.submitted_at) }}</p>
      <a v-if="submission?.file_url" :href="submission.file_url" class="attachment-link">ดาวน์โหลด · {{ submission.original_name || 'ไฟล์แนบ' }}</a>
      <div v-if="graded" class="grade-result"><span class="eyebrow">คะแนนของคุณ</span><p class="grade-number">{{ submission?.grade }} <span>/ {{ assignment.max_points }}</span></p><h3>ความคิดเห็นจากครู</h3><p class="plain-text">{{ submission?.feedback || 'ครูไม่ได้ระบุความคิดเห็น' }}</p></div>
      <template v-if="graded || assignment.class_archived"><p v-if="submission?.answer_text" class="plain-text submitted-answer">{{ submission.answer_text }}</p><p class="muted">{{ graded ? 'ครูตรวจงานแล้ว จึงไม่สามารถแก้ไขคำตอบได้' : 'ห้องเรียนถูกเก็บแล้ว จึงไม่สามารถส่งหรือแก้ไขงานได้' }}</p></template>
      <form v-else class="submission-form" @submit.prevent="save">
        <div class="field"><label for="submission-answer">คำตอบของคุณ</label><textarea id="submission-answer" v-model="answer" maxlength="5000" rows="7" :disabled="pending" placeholder="เขียนคำตอบ หรือแนบไฟล์ด้านล่าง" /></div>
        <div class="field"><label for="submission-file">แนบไฟล์ (ไม่บังคับ)</label><input id="submission-file" ref="fileInput" type="file" accept=".pdf,.jpg,.jpeg,.png,.docx" :disabled="pending" aria-describedby="submission-file-help" @change="chooseFile"><small id="submission-file-help">PDF, JPG, PNG หรือ DOCX ไม่เกิน 10 MB · เลือกไฟล์ใหม่เพื่อแทนไฟล์เดิม</small></div>
        <label v-if="submission?.file_url && !file" class="checkbox-field"><input v-model="removeFile" type="checkbox" :disabled="pending">ลบไฟล์แนบเดิมเมื่อบันทึก</label>
        <p v-if="assignment.due_at && !assignment.allow_late" class="muted">งานนี้ไม่รับการส่งหลังหมดเขต</p>
        <p v-if="error" class="error-message" role="alert">{{ error }}</p><p v-if="success" class="success-message" role="status">{{ success }}</p>
        <button class="button primary" :disabled="pending">{{ pending ? 'กำลังส่งงาน…' : submission ? 'บันทึกงานอีกครั้ง' : 'ส่งงาน' }}</button>
        <small class="muted">คุณแก้ไขงานได้จนกว่าครูจะตรวจ และตามกำหนดส่งของงาน</small>
      </form>
    </template>
  </section>
</template>
