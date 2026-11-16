<script setup lang="ts">
const route = useRoute();
await navigateTo(`/classes/${route.params.id}/stream`, { replace: true });
</script>
<template><p class="loading-text">กำลังเปิดสตรีม…</p></template>
