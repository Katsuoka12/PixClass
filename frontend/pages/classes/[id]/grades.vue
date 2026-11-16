<script setup lang="ts">
import type { Classroom, PublicSubmission } from '~/types/api';
const props = defineProps<{ classroom: Classroom }>();
definePageMeta({ middleware: 'role', role: 'teacher' });
const assignments = useAssignments();
const { data, error, status, refresh } = await useAsyncData(() => `gradebook-${props.classroom.id}`, () => assignments.gradebook(props.classroom.id));
function score(submissions: PublicSubmission[], assignmentId: number, maxPoints: number): string {
  const submission = submissions.find(item => item.assignment_id === assignmentId);
  if (!submission) return 'ยังไม่ส่ง';
  if (submission.grade !== null) return `${submission.grade} / ${maxPoints}`;
  return submission.is_late ? 'ส่งช้า · รอตรวจ' : 'ส่งแล้ว · รอตรวจ';
}
</script>

<template>
  <section class="gradebook-section"><div class="section-heading"><div><span class="eyebrow">ภาพรวมการเรียนรู้</span><h2>คะแนนของห้องเรียน</h2></div><button class="button subtle" :disabled="status === 'pending'" @click="refresh()">โหลดใหม่</button></div>
    <p v-if="status === 'pending'" class="loading-text" role="status">กำลังโหลดคะแนน…</p><div v-else-if="error" class="error-message" role="alert">{{ apiErrorMessage(error) }}</div>
    <div v-else-if="!data?.data.assignments.length" class="content-card empty-state"><h3>ยังไม่มีงานสำหรับแสดงคะแนน</h3><p>เมื่อสร้างงานแล้ว ตารางคะแนนจะปรากฏที่นี่</p><NuxtLink :to="`/classes/${classroom.id}/classwork`" class="button subtle">ไปที่งานในชั้นเรียน</NuxtLink></div>
    <div v-else-if="!data.data.students.length" class="content-card empty-state"><h3>ยังไม่มีนักเรียนในห้องเรียนนี้</h3><p>คะแนนจะแสดงเมื่อนักเรียนเข้าร่วมห้องและส่งงาน</p></div>
    <template v-else><p id="gradebook-help" class="muted table-help">เลื่อนตารางไปทางขวาเพื่อดูงานทั้งหมด · เลือกชื่องานเพื่อเปิดหน้าตรวจงาน</p><div class="gradebook-scroll" tabindex="0" role="region" aria-label="ตารางคะแนนที่เลื่อนได้" aria-describedby="gradebook-help"><table class="gradebook-table"><caption>คะแนนนักเรียนใน {{ classroom.name }}</caption><thead><tr><th scope="col">นักเรียน</th><th v-for="assignment in data.data.assignments" :key="assignment.id" scope="col"><NuxtLink :to="`/assignments/${assignment.id}`">{{ assignment.title }}</NuxtLink><small>{{ assignment.max_points }} คะแนน</small></th></tr></thead><tbody><tr v-for="student in data.data.students" :key="student.id"><th scope="row">{{ student.name }}</th><td v-for="assignment in data.data.assignments" :key="assignment.id">{{ score(student.submissions, assignment.id, assignment.max_points) }}</td></tr></tbody></table></div></template>
  </section>
</template>
