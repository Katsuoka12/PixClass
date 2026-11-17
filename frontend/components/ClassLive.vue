<script setup lang="ts">
import type { Classroom } from '~/types/api';
const props = defineProps<{ classroom: Classroom }>();
const live = useLive();
const auth = useAuth();
const teacher = computed(() => auth.user.value?.role === 'teacher' && auth.user.value.id === props.classroom.teacher_id);
const { data, error: loadError, status, refresh } = await useAsyncData(() => `class-live-${props.classroom.id}`, () => live.list(props.classroom.id));
const sessions = computed(() => data.value?.data.sessions ?? []);
const active = computed(() => sessions.value.find(session => !session.ended_at));
const title = ref('');
const pending = ref(false);
const error = ref('');
const success = ref('');
const confirmEnd = ref(false);
async function start() {
  if (pending.value) return;
  pending.value = true; error.value = ''; success.value = '';
  try { await live.start(props.classroom.id, title.value.trim()); title.value = ''; await refresh(); success.value = 'เริ่มคาบแล้ว นักเรียนเข้าเรียนจากหน้านี้ได้'; }
  catch (cause) { error.value = apiErrorMessage(cause); }
  finally { pending.value = false; }
}
async function join(id: number) {
  if (pending.value) return;
  pending.value = true; error.value = '';
  try {
    const response = await live.link(id);
    const url = new URL(response.data.url, window.location.origin);
    const destination = liveRedirect(`${url.pathname}${url.search}`);
    if (url.origin !== window.location.origin || !destination) throw new Error('Invalid live link');
    await navigateTo(destination);
  } catch (cause) { error.value = apiErrorMessage(cause); }
  finally { pending.value = false; }
}
async function end() {
  if (!active.value || pending.value) return;
  pending.value = true; error.value = ''; success.value = '';
  try { const id = active.value.id; await live.end(id); confirmEnd.value = false; await navigateTo(`/live/${id}/attendance`); }
  catch (cause) { error.value = apiErrorMessage(cause); }
  finally { pending.value = false; }
}
</script>

<template>
  <section class="content-card class-live" aria-labelledby="class-live-heading">
    <div class="section-heading"><div><span class="eyebrow">พบกันในห้องเรียน</span><h2 id="class-live-heading">ห้องเรียนสด</h2></div><button class="button subtle" :disabled="status === 'pending' || pending" @click="refresh()">ตรวจสอบคาบเรียน</button></div>
    <p v-if="loadError" class="error-message" role="alert">{{ apiErrorMessage(loadError) }}</p>
    <template v-else>
      <div v-if="active" class="live-active"><span class="submission-badge">กำลังเปิดคาบ</span><h3>{{ active.title }}</h3><p class="muted">เริ่ม {{ active.started_at ? classroomDate(active.started_at) : 'แล้ว' }} · ไม่ต้องเชื่อม Telegram ก็เข้าเรียนได้</p>
        <div class="live-actions"><button v-if="!classroom.archived" class="button primary" :disabled="pending" @click="join(active.id)">{{ pending ? 'กำลังดำเนินการ…' : 'เข้าเรียน' }}</button><NuxtLink v-if="teacher" :to="`/live/${active.id}/attendance`" class="button subtle">ดูเช็คชื่อ</NuxtLink><button v-if="teacher" class="button subtle" :disabled="pending" @click="confirmEnd = !confirmEnd">จบคาบ</button></div>
        <div v-if="confirmEnd && teacher" class="live-confirm"><p>จบคาบนี้หรือไม่? ลิงก์เข้าเรียนจะหยุดใช้งาน และระบบจะบันทึกเวลาออกของผู้ที่ยังอยู่</p><div class="live-actions"><button class="button primary" :disabled="pending" @click="end">ยืนยันจบคาบ</button><button class="button subtle" :disabled="pending" @click="confirmEnd = false">ยกเลิก</button></div></div>
      </div>
      <form v-else-if="teacher && !classroom.archived" class="live-start-form" :aria-busy="pending" @submit.prevent="start"><p class="muted">เปิดคาบวิดีโอด้วย Jitsi และส่งคำเชิญให้นักเรียนที่เชื่อม Telegram</p><div class="field"><label :for="`live-title-${classroom.id}`">ชื่อคาบเรียน</label><input :id="`live-title-${classroom.id}`" v-model="title" required maxlength="200" placeholder="เช่น ทบทวนบทเรียนวันนี้" :disabled="pending"></div><button class="button primary" :disabled="pending || !title.trim()">{{ pending ? 'กำลังเริ่มคาบ…' : 'เริ่ม Live Class' }}</button></form>
      <p v-else class="muted">{{ classroom.archived ? 'ห้องเรียนนี้ถูกเก็บแล้ว' : 'ยังไม่มีคาบเรียนสดที่เปิดอยู่ กดตรวจสอบคาบเรียนเมื่อครูเริ่มสอน' }}</p>
      <details v-if="teacher && sessions.some(session => session.ended_at)" class="live-history"><summary>ประวัติคาบเรียนและเช็คชื่อ</summary><ul><li v-for="session in sessions.filter(item => item.ended_at)" :key="session.id"><div><strong>{{ session.title }}</strong><p class="muted">จบ {{ classroomDate(session.ended_at!) }}</p></div><NuxtLink :to="`/live/${session.id}/attendance`" class="button subtle">ดูเช็คชื่อ</NuxtLink></li></ul></details>
    </template>
    <p v-if="error" class="error-message" role="alert">{{ error }}</p><p v-if="success" class="success-message" role="status">{{ success }}</p>
  </section>
</template>
