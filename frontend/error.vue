<script setup lang="ts">
import type { NuxtError } from '#app';
defineProps<{ error: NuxtError }>();
</script>
<template><main class="error-page"><BrandMark /><span class="error-code">{{ error.statusCode }}</span><h1>{{ error.statusCode === 403 ? 'คุณไม่มีสิทธิ์เข้าถึงหน้านี้' : error.statusCode === 404 ? 'ไม่พบหน้าที่ต้องการ' : 'ยังเปิดหน้านี้ไม่ได้' }}</h1><p>กลับไปหน้าแรก หรือลองเข้าสู่ระบบอีกครั้ง</p><button class="button primary" @click="clearError({ redirect: '/' })">กลับหน้าแรก <span aria-hidden="true">↗</span></button></main></template>
