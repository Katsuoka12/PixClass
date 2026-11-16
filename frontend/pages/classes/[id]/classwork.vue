<script setup lang="ts">
import type { Assignment, Classroom } from '~/types/api';
const props = defineProps<{ classroom: Classroom }>();
const auth = useAuth();
const assignments = useAssignments();
const teacher = computed(() => auth.user.value?.role === 'teacher' && auth.user.value.id === props.classroom.teacher_id);
const { data, error, status, refresh } = await useAsyncData(() => `assignments-${props.classroom.id}`, () => assignments.list(props.classroom.id));
const creating = ref(false);
function created(assignment: Assignment) {
  if (data.value) data.value = { data: { assignments: [assignment, ...data.value.data.assignments] } };
  else void refresh();
  creating.value = false;
}
</script>

<template>
  <section class="assignment-section">
    <div class="section-heading"><div><span class="eyebrow">เรียนรู้ทีละก้าว</span><h2>งานในชั้นเรียน</h2></div><button v-if="teacher && !classroom.archived" class="button primary" :aria-expanded="creating" @click="creating = !creating">{{ creating ? 'ปิดฟอร์ม' : '+ สร้างงาน' }}</button></div>
    <AssignmentEditor v-if="creating && !classroom.archived" :class-id="classroom.id" @saved="created" @cancel="creating = false" />
    <p v-if="status === 'pending'" class="loading-text" role="status">กำลังโหลดงาน…</p>
    <div v-else-if="error" class="error-message" role="alert"><p>{{ apiErrorMessage(error) }}</p><button class="button subtle" @click="refresh()">ลองอีกครั้ง</button></div>
    <div v-else-if="!data?.data.assignments.length" class="content-card empty-state"><h3>ยังไม่มีงานในห้องเรียนนี้</h3><p>{{ teacher ? 'เริ่มสร้างงานชิ้นแรกให้นักเรียนได้เรียนรู้ด้วยกัน' : 'เมื่อครูสร้างงาน คุณจะเห็นรายละเอียดได้ที่นี่' }}</p></div>
    <div v-else class="assignment-list"><NuxtLink v-for="assignment in data.data.assignments" :key="assignment.id" :to="`/assignments/${assignment.id}`" class="assignment-card content-card"><div><h3>{{ assignment.title }}</h3><p class="muted">{{ assignment.due_at ? `กำหนดส่ง ${classroomDate(assignment.due_at)}` : 'ไม่มีกำหนดส่ง' }}</p></div><div class="assignment-card-meta"><span>{{ assignment.max_points }} คะแนน</span><span aria-hidden="true">→</span></div></NuxtLink></div>
  </section>
</template>
