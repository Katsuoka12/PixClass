<script setup lang="ts">
import type { ReminderResult } from '~/types/api';
definePageMeta({ middleware: 'role', role: 'teacher' });
useHead({ title: 'เช็คชื่อห้องเรียนสด · Student Tag' });
const route = useRoute();
const live = useLive();
const id = Number(route.params.id);
if (!Number.isInteger(id) || id < 1 || id > 4294967295) throw createError({ statusCode: 404, message: 'ไม่พบคาบเรียน' });
const { data, error: loadError, status, refresh } = await useAsyncData(`live-attendance-${id}`, () => live.attendance(id));
const session = computed(() => data.value?.data.session);
const students = computed(() => data.value?.data.students ?? []);
const present = computed(() => students.value.filter(student => student.joined_at).length);
const missing = computed(() => students.value.length - present.value);
const pending = ref(false);
const error = ref('');
const confirmEnd = ref(false);
const result = ref<ReminderResult | null>(null);
async function end() {
  if (pending.value) return;
  pending.value = true; error.value = '';
  try { await live.end(id); confirmEnd.value = false; await refresh(); }
  catch (cause) { error.value = apiErrorMessage(cause); }
  finally { pending.value = false; }
}
async function remind() {
  if (pending.value) return;
  pending.value = true; error.value = ''; result.value = null;
  try { result.value = (await live.remindAbsent(id)).data; }
  catch (cause) { error.value = apiErrorMessage(cause); }
  finally { pending.value = false; }
}
</script>

<template>
  <div class="workspace"><WorkspaceHeader /><main id="main-content" class="dashboard live-attendance-page">
    <NuxtLink :to="session ? `/classes/${session.class_id}/stream` : '/'" class="back-link">← กลับห้องเรียน</NuxtLink>
    <div class="dashboard-heading"><div><span class="eyebrow">บันทึกการเรียนรู้ร่วมกัน</span><h1>เช็คชื่อห้องเรียนสด</h1><p class="muted">{{ session?.title || 'รายชื่อเข้าเรียน' }}</p></div><button class="button subtle" :disabled="status === 'pending' || pending" @click="refresh()">โหลดเช็คชื่อใหม่</button></div>
    <p v-if="status === 'pending'" class="loading-text" role="status">กำลังโหลดเช็คชื่อ…</p><p v-else-if="loadError" class="error-message" role="alert">{{ apiErrorMessage(loadError) }}</p>
    <template v-else-if="session">
      <section class="content-card live-session-summary"><span class="submission-badge">{{ session.ended_at ? 'จบคาบแล้ว' : 'กำลังเปิดคาบ' }}</span><h2>{{ session.class_name }}</h2><p class="muted">เริ่ม {{ session.started_at ? classroomDate(session.started_at) : '—' }}<template v-if="session.ended_at"> · จบ {{ classroomDate(session.ended_at) }}</template></p><p class="muted">เช็คชื่อจากการเปิดหน้าเรียน ไม่ยืนยันตัวบุคคลหรือระยะเวลาวิดีโอจริง เวลาออกอาจไม่ครบเมื่ออุปกรณ์ขาดการเชื่อมต่อ</p><div class="submission-summary"><span>เข้าเรียน <strong>{{ present }}</strong></span><span>ยังไม่เข้า <strong>{{ missing }}</strong></span><span>นักเรียนทั้งหมด <strong>{{ students.length }}</strong></span></div>
        <div class="live-actions"><button v-if="!session.ended_at" class="button primary" :disabled="pending" @click="confirmEnd = !confirmEnd">จบคาบ</button><button v-else class="button subtle" :disabled="pending || !missing || session.class_archived" @click="remind">{{ pending ? 'กำลังส่งข้อความ…' : 'แจ้งเตือนคนที่ขาด' }}</button></div>
        <div v-if="confirmEnd && !session.ended_at" class="live-confirm"><p>ยืนยันจบคาบและบันทึกเวลาออกของผู้ที่ยังอยู่หรือไม่?</p><div class="live-actions"><button class="button primary" :disabled="pending" @click="end">ยืนยันจบคาบ</button><button class="button subtle" :disabled="pending" @click="confirmEnd = false">ยกเลิก</button></div></div>
      </section>
      <p v-if="error" class="error-message" role="alert">{{ error }}</p><div v-if="result" class="success-message" role="status"><p>นักเรียนที่ขาด {{ result.total }} คน · ส่งสำเร็จ {{ result.sent }} คน</p><p>ไม่เชื่อม Telegram {{ result.unlinked }} คน · พักแจ้งเตือน {{ result.muted }} คน · ส่งไม่สำเร็จ {{ result.failed }} คน · ข้าม {{ result.skipped }} คน</p></div>
      <div v-if="!students.length" class="content-card empty-state"><h2>ยังไม่มีนักเรียนในห้อง</h2><p>รายชื่อจะอ้างอิงสมาชิกนักเรียนที่ใช้งานอยู่ในปัจจุบัน</p></div>
      <div v-else class="content-card attendance-table-wrap" role="region" aria-label="ตารางเช็คชื่อ เลื่อนแนวนอนเพื่อดูข้อมูลทั้งหมด" tabindex="0"><table class="attendance-table"><caption>รายชื่อสมาชิกปัจจุบัน · {{ session.title }}</caption><thead><tr><th scope="col">นักเรียน</th><th scope="col">สถานะ</th><th scope="col">เวลาเข้า</th><th scope="col">เวลาออกล่าสุด</th></tr></thead><tbody><tr v-for="student in students" :key="student.user_id"><th scope="row">{{ student.name }}</th><td><span class="submission-badge" :class="{ missing: !student.joined_at }">{{ student.joined_at ? 'เข้าเรียนแล้ว' : session.ended_at ? 'ขาดเรียน' : 'ยังไม่เข้า' }}</span></td><td>{{ student.joined_at ? classroomDate(student.joined_at) : '—' }}</td><td>{{ student.left_at ? classroomDate(student.left_at) : student.joined_at ? 'ยังไม่มีบันทึกออก' : '—' }}</td></tr></tbody></table></div>
    </template>
  </main><footer class="workspace-footer">STUDENT TAG <span>เรียนรู้ • เชื่อมต่อ • เติบโต</span></footer></div>
</template>
