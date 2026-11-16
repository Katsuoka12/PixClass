<script setup lang="ts">
const { user } = useAuth();
await navigateTo(user.value ? `/${user.value.role}` : '/login');
</script>
<template><p class="loading-text">กำลังเปิดห้องเรียนของคุณ…</p></template>
