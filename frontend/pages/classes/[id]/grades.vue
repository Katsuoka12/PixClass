<script setup lang="ts">
import type { Classroom } from '~/types/api';
defineProps<{ classroom: Classroom }>();
definePageMeta({ middleware: 'role', role: 'teacher' });
</script>
<template><section class="content-card empty-state"><span class="empty-icon" aria-hidden="true">↗</span><h2>คะแนนของห้องเรียน</h2><p>ตารางคะแนนและการตรวจงานจะพร้อมเมื่อเปิดระบบงานในชั้นเรียนในขั้นถัดไป</p></section></template>
