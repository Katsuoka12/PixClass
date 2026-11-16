<script setup lang="ts">
import type { Classroom } from '~/types/api';
defineProps<{ classroom: Classroom }>();
</script>
<template><section class="content-card empty-state"><span class="empty-icon" aria-hidden="true">↗</span><h2>งานในชั้นเรียน</h2><p>ระบบสร้างงานและส่งงานจะพร้อมในขั้นถัดไป<br>ระหว่างนี้ติดตามประกาศได้ที่สตรีมของห้องเรียน</p><NuxtLink :to="`/classes/${classroom.id}/stream`" class="button subtle">ไปที่สตรีม</NuxtLink></section></template>
