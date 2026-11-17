<script setup lang="ts">
import type { LiveEntry, LiveSession } from '~/types/api';
definePageMeta({ key: 'live-join' });
useHead({ title: 'เข้าเรียนสด · Student Tag', meta: [{ name: 'referrer', content: 'no-referrer' }] });
const route = useRoute();
const router = useRouter();
const live = useLive();
const config = useRuntimeConfig();
const token = ref(typeof route.query.t === 'string' && /^[a-f0-9]{64}$/.test(route.query.t) ? route.query.t : '');
const entry = ref<LiveEntry | null>(null);
const summary = ref<LiveSession | null>(null);
const pending = ref(false);
const error = ref('');
const notice = ref('');
const inConference = ref(false);
const closed = ref(false);
const fallback = computed(() => entry.value ? jitsiRoomUrl(entry.value.domain, entry.value.room_name, entry.value.display_name) : null);
let alive = true;
let leaving = false;
let checking = false;
let poll: ReturnType<typeof setInterval> | undefined;

function beacon(id: number) {
  const endpoint = `${String(config.public.apiBase).replace(/\/$/, '')}/live/${id}/leave`;
  const body = JSON.stringify({});
  if (!navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }))) {
    void fetch(endpoint, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
  }
}
function pagehide() {
  if (!entry.value || leaving) return;
  leaving = true;
  beacon(entry.value.session.id);
  entry.value = null;
  inConference.value = false;
  notice.value = 'บันทึกออกจากหน้าเรียนแล้ว กดเข้าเรียนอีกครั้งเมื่อต้องการกลับเข้าคาบ';
}
async function exit(message = 'ออกจากห้องเรียนแล้ว', ended = false) {
  if (!entry.value || leaving) return;
  leaving = true;
  const id = entry.value.session.id;
  entry.value = null;
  inConference.value = false;
  closed.value = ended;
  notice.value = message;
  try { await live.leave(id); }
  catch { beacon(id); error.value = 'ยืนยันเวลาออกไม่ได้ ระบบพยายามส่งซ้ำแล้ว'; }
  finally { leaving = false; }
}
async function enter() {
  if (pending.value || !token.value || closed.value) return;
  pending.value = true; error.value = ''; notice.value = '';
  leaving = false;
  try {
    // Remove the bearer link before any third-party script or iframe is loaded.
    if (route.query.t) await router.replace({ path: '/live/join', query: {} });
    const response = await live.join(token.value);
    if (!alive) { beacon(response.data.session.id); return; }
    if (!jitsiRoomUrl(response.data.domain, response.data.room_name, response.data.display_name)) { beacon(response.data.session.id); throw new Error('Invalid room'); }
    summary.value = response.data.session;
    entry.value = response.data;
  } catch (cause) { if (alive) error.value = apiErrorMessage(cause); }
  finally { pending.value = false; }
}
async function checkSession() {
  if (!entry.value || checking || leaving) return;
  checking = true;
  const current = entry.value.session;
  try {
    const response = await live.list(current.class_id);
    const session = response.data.sessions.find(item => item.id === current.id);
    if (entry.value?.session.id === current.id && (!session || session.ended_at || session.class_archived)) await exit('คาบเรียนสิ้นสุดหรือห้องเรียนถูกเก็บแล้ว', true);
  } catch (cause) {
    const status = cause && typeof cause === 'object' && 'statusCode' in cause ? cause.statusCode : undefined;
    if ([401, 403, 404].includes(Number(status))) {
      token.value = '';
      await exit('สิทธิ์เข้าเรียนหรือการเข้าสู่ระบบหมดอายุ กรุณาเข้าห้องเรียนใหม่', true);
    } else if (entry.value) error.value = 'ตรวจสอบสถานะคาบไม่ได้ชั่วคราว โปรดตรวจการเชื่อมต่อ';
  } finally { checking = false; }
}
onMounted(() => {
  if (route.query.t) void router.replace({ path: '/live/join', query: {} }).catch(() => { error.value = 'เตรียมหน้าเข้าเรียนไม่ได้ กรุณาลองเปิดลิงก์จากห้องเรียนอีกครั้ง'; });
  window.addEventListener('pagehide', pagehide);
  poll = setInterval(() => { void checkSession(); }, 15000);
});
onBeforeUnmount(() => {
  alive = false;
  clearInterval(poll);
  window.removeEventListener('pagehide', pagehide);
  if (entry.value && !leaving) beacon(entry.value.session.id);
  entry.value = null;
});
</script>

<template>
  <div class="workspace"><WorkspaceHeader /><main id="main-content" class="dashboard live-join-page">
    <NuxtLink :to="summary ? `/classes/${summary.class_id}/stream` : '/'" class="back-link">← {{ summary ? 'กลับห้องเรียน' : 'ห้องเรียนทั้งหมด' }}</NuxtLink>
    <div class="dashboard-heading"><div><span class="eyebrow">เรียนรู้ไปพร้อมกัน</span><h1>{{ summary?.title || 'เข้าเรียนสด' }}</h1><p class="muted">{{ summary?.class_name || 'ห้องเรียนวิดีโอผ่าน Jitsi Meet' }}</p></div><button v-if="entry" class="button subtle" @click="exit()">ออกจากห้องเรียน</button></div>
    <p v-if="notice" class="success-message" role="status">{{ notice }}</p><p v-if="error" class="error-message" role="alert">{{ error }}</p>
    <section v-if="!entry" class="content-card live-entry-card">
      <h2>{{ closed ? 'คาบเรียนนี้ปิดแล้ว' : 'พร้อมเข้าเรียนหรือยัง?' }}</h2>
      <p>เมื่อกดเข้าเรียน ระบบจะบันทึกเวลาเปิดหน้าเรียนของคุณ แล้วเชื่อมต่อ Jitsi ที่ผู้ดูแลกำหนด ชื่อที่แสดง รวมถึงเสียงและวิดีโอที่คุณเลือกเปิดจะส่งไปยัง Jitsi</p>
      <p class="muted">เวลาเช็คชื่อเป็นการเข้า–ออกหน้าเรียนแบบ best effort ไม่ใช่หลักฐานระยะเวลาที่เข้าวิดีโอจริง กล้องและไมโครโฟนเริ่มแบบปิด คุณเลือกเปิดได้ในห้อง</p>
      <button v-if="token && !closed" class="button primary" :disabled="pending" @click="enter">{{ pending ? 'กำลังตรวจสิทธิ์เข้าเรียน…' : 'เข้าเรียนและบันทึกเช็คชื่อ' }}</button>
      <p v-else-if="!closed" class="archive-notice">ลิงก์เข้าเรียนหายไปหรือไม่ถูกต้อง กรุณากลับหน้าห้องแล้วกดเข้าเรียนเพื่อรับลิงก์ใหม่</p>
    </section>
    <template v-else>
      <p class="live-checkin-note" role="status">บันทึกเวลาเข้าหน้าเรียนแล้ว · {{ inConference ? 'เชื่อมต่อวิดีโอแล้ว' : 'รอเข้าห้องวิดีโอ' }} · {{ entry.domain }}</p>
      <JitsiMeeting :key="entry.session.id" :domain="entry.domain" :room-name="entry.room_name" :display-name="entry.display_name" @joined="inConference = true" @left="exit()" />
      <section class="content-card live-fallback"><h2>เข้า Jitsi ในหน้านี้ไม่ได้?</h2><p>Jitsi สาธารณะอาจให้ครูล็อกอินก่อนสร้างห้อง หรือเบราว์เซอร์อาจไม่รองรับการฝัง</p><a v-if="fallback" :href="fallback" class="button subtle" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">เปิดห้องในแท็บใหม่ ↗</a><p class="muted">เมื่อใช้แท็บใหม่ Student Tag จะไม่ทราบเวลาออกจาก Jitsi ให้กลับมากดออกจากห้องเรียนที่หน้านี้เมื่อเรียนเสร็จ การปิดคาบใน Student Tag ไม่ได้บังคับปิดห้อง Jitsi สาธารณะ</p></section>
    </template>
  </main><footer class="workspace-footer">STUDENT TAG <span>เรียนรู้ • เชื่อมต่อ • เติบโต</span></footer></div>
</template>
