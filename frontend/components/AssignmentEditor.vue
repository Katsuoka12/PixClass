<script setup lang="ts">
import type { Assignment, AssignmentInput } from '~/types/api';
const props = defineProps<{ classId: number; assignment?: Assignment }>();
const emit = defineEmits<{ saved: [assignment: Assignment]; cancel: [] }>();
const assignments = useAssignments();
const title = ref(props.assignment?.title || '');
const description = ref(props.assignment?.description || '');
const due = ref('');
const maxPoints = ref(props.assignment?.max_points ?? 100);
const allowLate = ref(props.assignment?.allow_late ?? true);
const pending = ref(false);
const error = ref('');
const fieldId = `assignment-${props.assignment?.id ?? 'new'}`;
// datetime-local uses the teacher's browser timezone, then sends explicit UTC.
onMounted(() => {
  if (!props.assignment?.due_at) return;
  const date = new Date(props.assignment.due_at);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  due.value = local.toISOString().slice(0, 16);
});
async function save() {
  if (pending.value) return;
  pending.value = true;
  error.value = '';
  try {
    const input: AssignmentInput = { title: title.value.trim(), description: description.value, due_at: due.value ? new Date(due.value).toISOString() : null, max_points: Number(maxPoints.value), allow_late: allowLate.value };
    const result = props.assignment ? await assignments.update(props.assignment.id, input) : await assignments.create(props.classId, input);
    emit('saved', result.data.assignment);
  } catch (cause) { error.value = apiErrorMessage(cause); }
  finally { pending.value = false; }
}
</script>

<template>
  <form class="content-card assignment-form" @submit.prevent="save">
    <h2>{{ assignment ? 'แก้ไขงาน' : 'สร้างงานใหม่' }}</h2>
    <div class="field"><label :for="`${fieldId}-title`">ชื่องาน</label><input :id="`${fieldId}-title`" v-model="title" required maxlength="200" :disabled="pending"></div>
    <div class="field"><label :for="`${fieldId}-description`">คำอธิบาย</label><textarea :id="`${fieldId}-description`" v-model="description" maxlength="5000" rows="5" :disabled="pending" /></div>
    <div class="assignment-fields"><div class="field"><label :for="`${fieldId}-due`">กำหนดส่ง (ไม่บังคับ)</label><input :id="`${fieldId}-due`" v-model="due" type="datetime-local" :disabled="pending"><small>เลือกเวลาตามเขตเวลาของอุปกรณ์คุณ</small></div><div class="field"><label :for="`${fieldId}-points`">คะแนนเต็ม</label><input :id="`${fieldId}-points`" v-model.number="maxPoints" type="number" required min="1" max="9999" step="1" :disabled="pending"></div></div>
    <label class="checkbox-field"><input v-model="allowLate" type="checkbox" :disabled="pending">อนุญาตให้ส่งหลังหมดเขต</label>
    <p v-if="error" class="error-message" role="alert">{{ error }}</p>
    <div class="form-actions"><button class="button primary" :disabled="pending">{{ pending ? 'กำลังบันทึก…' : assignment ? 'บันทึกการแก้ไข' : 'สร้างงาน' }}</button><button type="button" class="button subtle" :disabled="pending" @click="emit('cancel')">ยกเลิก</button></div>
  </form>
</template>
