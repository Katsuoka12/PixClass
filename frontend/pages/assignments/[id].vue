<script setup lang="ts">
import type { Assignment } from '~/types/api';
definePageMeta({ key: route => route.fullPath });
const route = useRoute();
const id = Number(route.params.id);
if (!Number.isInteger(id) || id < 1 || id > 4294967295) throw createError({ statusCode: 404, message: 'ไม่พบงานนี้' });
const auth = useAuth();
const assignments = useAssignments();
const classrooms = useClassrooms();
const { data, error: loadError } = await useAsyncData(`assignment-detail-${id}`, async () => {
  const result = await assignments.get(id);
  const room = await classrooms.get(result.data.assignment.class_id);
  return { assignment: result.data.assignment, classroom: room.data.class };
});
if (loadError.value || !data.value) throw createError({ statusCode: loadError.value?.statusCode || 503, message: 'ไม่สามารถเปิดงานนี้ได้ กรุณาตรวจสอบสิทธิ์หรือลองอีกครั้ง' });
const assignment = computed(() => data.value!.assignment);
const teacher = computed(() => auth.user.value?.role === 'teacher' && auth.user.value.id === data.value!.classroom.teacher_id);
const editing = ref(false);
const deleting = ref(false);
const pending = ref(false);
const error = ref('');
useHead({ title: () => `${assignment.value.title} · Student Tag` });
function saved(value: Assignment) { if (data.value) data.value = { ...data.value, assignment: value }; editing.value = false; }
async function remove() {
  if (pending.value) return;
  pending.value = true;
  error.value = '';
  try { await assignments.remove(id); await navigateTo(`/classes/${assignment.value.class_id}/classwork`); }
  catch (cause) { error.value = apiErrorMessage(cause); }
  finally { pending.value = false; }
}
</script>

<template>
  <div class="workspace"><WorkspaceHeader /><main v-if="data" id="main-content" class="dashboard assignment-page">
    <NuxtLink :to="`/classes/${assignment.class_id}/classwork`" class="back-link">← งานใน {{ assignment.class_name }}</NuxtLink>
    <section class="content-card assignment-detail"><span class="eyebrow">{{ assignment.class_name }}</span><h1>{{ assignment.title }}</h1><div class="assignment-detail-meta"><span>{{ assignment.due_at ? `กำหนดส่ง ${classroomDate(assignment.due_at)}` : 'ไม่มีกำหนดส่ง' }}</span><span>{{ assignment.max_points }} คะแนน</span><span>{{ assignment.allow_late ? 'ส่งหลังหมดเขตได้' : 'ไม่รับงานหลังหมดเขต' }}</span></div><p class="plain-text assignment-description">{{ assignment.description || 'ครูไม่ได้ระบุคำอธิบายเพิ่มเติม' }}</p>
      <div v-if="teacher && !assignment.class_archived" class="form-actions"><button class="button subtle" :aria-expanded="editing" :disabled="pending" @click="editing = !editing; deleting = false">{{ editing ? 'ปิดการแก้ไข' : 'แก้ไขงาน' }}</button><button class="button danger" :aria-expanded="deleting" :disabled="pending" @click="deleting = !deleting; editing = false">ลบงาน</button></div>
    </section>
    <p v-if="assignment.class_archived" class="archive-notice" role="status">ห้องเรียนนี้ถูกเก็บแล้ว คุณยังอ่านงานและคะแนนเดิมได้</p>
    <p v-if="error" class="error-message" role="alert">{{ error }}</p>
    <section v-if="deleting && !assignment.class_archived" class="content-card delete-confirm"><h2>ลบงานนี้หรือไม่?</h2><p>คำตอบ ไฟล์แนบ และคะแนนของนักเรียนในงานนี้จะถูกลบด้วย และไม่สามารถกู้คืนได้</p><div class="form-actions"><button class="button danger" :disabled="pending" @click="remove">{{ pending ? 'กำลังลบ…' : 'ยืนยันลบงาน' }}</button><button class="button subtle" :disabled="pending" @click="deleting = false">ยกเลิก</button></div></section>
    <AssignmentEditor v-if="teacher && editing && !assignment.class_archived" :key="assignment.id" :class-id="assignment.class_id" :assignment="assignment" @saved="saved" @cancel="editing = false" />
    <TeacherSubmissions v-if="teacher" :assignment="assignment" /><StudentSubmission v-else-if="auth.user.value?.role === 'student'" :assignment="assignment" />
  </main><footer class="workspace-footer">STUDENT TAG <span>เรียนรู้ • เชื่อมต่อ • เติบโต</span></footer></div>
</template>
