<script setup lang="ts">
definePageMeta({ middleware: 'role', role: 'student' });
useHead({ title: 'งานของฉัน · Student Tag' });
const assignments = useAssignments();
const { data, error, status, refresh } = await useAsyncData('student-todo', () => assignments.todo());
</script>

<template>
  <div class="workspace"><WorkspaceHeader /><main id="main-content" class="dashboard todo-page"><NuxtLink to="/" class="back-link">← ห้องเรียนทั้งหมด</NuxtLink><div class="dashboard-heading"><div><span class="eyebrow">วางแผนการเรียนรู้</span><h1>งานของฉัน</h1><p class="muted">ติดตามงานและคะแนนจากห้องเรียนที่กำลังเรียน</p></div><button class="button subtle" :disabled="status === 'pending'" @click="refresh()">โหลดใหม่</button></div>
    <p v-if="status === 'pending'" class="loading-text" role="status">กำลังโหลดงานของคุณ…</p><div v-else-if="error" class="error-message" role="alert">{{ apiErrorMessage(error) }}</div><div v-else-if="!data?.data.items.length" class="content-card empty-state"><h2>ยังไม่มีงานในตอนนี้</h2><p>งานจากห้องเรียนที่คุณเข้าร่วมจะแสดงที่นี่</p></div>
    <div v-else class="assignment-list"><NuxtLink v-for="item in data.data.items" :key="item.assignment.id" :to="`/assignments/${item.assignment.id}`" class="assignment-card content-card"><div><span class="eyebrow">{{ item.assignment.class_name }}</span><h2>{{ item.assignment.title }}</h2><p class="muted">{{ item.assignment.due_at ? `กำหนดส่ง ${classroomDate(item.assignment.due_at)}` : 'ไม่มีกำหนดส่ง' }}</p></div><div class="todo-result"><span class="submission-badge" :class="{ late: item.status === 'late', missing: item.status === 'missing' }">{{ assignmentStatus(item.status) }}</span><span v-if="item.submission?.grade != null">{{ item.submission.grade }} / {{ item.assignment.max_points }} คะแนน</span><span v-else class="muted">{{ item.assignment.max_points }} คะแนน</span></div></NuxtLink></div>
  </main><footer class="workspace-footer">STUDENT TAG <span>เรียนรู้ • เชื่อมต่อ • เติบโต</span></footer></div>
</template>
