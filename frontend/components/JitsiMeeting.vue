<script setup lang="ts">
const props = defineProps<{ domain: string; roomName: string; displayName: string }>();
const emit = defineEmits<{ joined: []; left: [] }>();
interface JitsiApi { addListener(event: string, listener: () => void): void; dispose(): void }
interface JitsiOptions { roomName: string; parentNode: HTMLElement; width: string; height: string; userInfo: { displayName: string }; configOverwrite: { startWithAudioMuted: boolean; startWithVideoMuted: boolean } }
type JitsiConstructor = new (domain: string, options: JitsiOptions) => JitsiApi;
const container = ref<HTMLElement | null>(null);
const loading = ref(true);
const error = ref('');
let api: JitsiApi | null = null;
let script: HTMLScriptElement | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let disposed = false;
let failed = false;
let left = false;
function onLeft() { if (!left && !disposed) { left = true; emit('left'); } }
onMounted(() => {
  if (!jitsiRoomUrl(props.domain, props.roomName, props.displayName)) { loading.value = false; error.value = 'ข้อมูลห้องเรียนไม่ถูกต้อง'; return; }
  script = document.createElement('script');
  script.src = `https://${props.domain}/external_api.js`;
  script.async = true;
  script.referrerPolicy = 'no-referrer';
  const fail = () => { failed = true; if (!disposed) { loading.value = false; error.value = 'โหลดห้องวิดีโอไม่ได้ ลองเปิดห้องในแท็บใหม่ด้านล่าง'; } };
  timer = setTimeout(() => { if (script) { script.onload = null; script.onerror = null; script.remove(); } fail(); }, 10000);
  script.onerror = () => { clearTimeout(timer); fail(); };
  script.onload = () => {
    clearTimeout(timer);
    if (disposed || failed || !container.value) return;
    const Constructor = (window as Window & { JitsiMeetExternalAPI?: JitsiConstructor }).JitsiMeetExternalAPI;
    if (!Constructor) { fail(); return; }
    try {
      api = new Constructor(props.domain, { roomName: props.roomName, parentNode: container.value, width: '100%', height: '100%', userInfo: { displayName: props.displayName }, configOverwrite: { startWithAudioMuted: true, startWithVideoMuted: true } });
      api.addListener('videoConferenceJoined', () => { if (!disposed) emit('joined'); });
      api.addListener('videoConferenceLeft', onLeft);
      api.addListener('readyToClose', onLeft);
      loading.value = false;
    } catch { fail(); }
  };
  document.head.append(script);
});
onBeforeUnmount(() => {
  disposed = true;
  clearTimeout(timer);
  if (script) { script.onload = null; script.onerror = null; script.remove(); }
  try { api?.dispose(); } catch { /* The iframe may already have been removed by Jitsi. */ }
  api = null;
});
</script>

<template><section class="jitsi-meeting" aria-label="วิดีโอห้องเรียน Jitsi"><p v-if="loading" class="loading-text" role="status">กำลังโหลดห้องวิดีโอ…</p><p v-if="error" class="error-message" role="alert">{{ error }}</p><div ref="container" class="jitsi-container" /></section></template>
