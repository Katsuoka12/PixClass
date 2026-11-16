<script setup lang="ts">
import type { Role } from '~/types/api';
const props = defineProps<{ role: Role }>();
const classrooms = useClassrooms();
const { data, error: loadError, status, refresh } = await useAsyncData(`classrooms-${props.role}`, classrooms.list);
const showForm = ref(false);
const name = ref('');
const section = ref('');
const code = ref('');
const pending = ref(false);
const error = ref('');
const teacher = computed(() => props.role === 'teacher');
const activeRooms = computed(() => data.value?.data.classes.filter(room => !room.archived) ?? []);
const archivedRooms = computed(() => data.value?.data.classes.filter(room => room.archived) ?? []);
async function submit() {
  if (pending.value) return;
  pending.value = true;
  error.value = '';
  try {
    const result = teacher.value ? await classrooms.create({ name: name.value, section: section.value }) : await classrooms.join(code.value);
    await refresh();
    await navigateTo(`/classes/${result.data.class.id}/stream`);
  } catch (cause) { error.value = apiErrorMessage(cause); }
  finally { pending.value = false; }
}
</script>

<template>
  <section class="classroom-list">
    <div class="section-heading"><div><span class="eyebrow">พื้นที่เรียนรู้ของเรา</span><h2>{{ teacher ? 'ห้องเรียนของคุณ' : 'ห้องเรียนของฉัน' }}</h2></div><button class="button primary" :aria-expanded="showForm" aria-controls="classroom-form" @click="showForm = !showForm">{{ teacher ? 'สร้างห้องเรียน' : 'เข้าร่วมห้องเรียน' }} <span aria-hidden="true">＋</span></button></div>
    <form v-if="showForm" id="classroom-form" class="classroom-form content-card" :aria-busy="pending" @submit.prevent="submit">
      <h3>{{ teacher ? 'เริ่มห้องเรียนใหม่' : 'เข้าร่วมด้วยรหัสจากครู' }}</h3>
      <template v-if="teacher"><div class="field"><label for="class-name">ชื่อห้องเรียน</label><input id="class-name" v-model="name" required maxlength="200" :disabled="pending" placeholder="เช่น วิทยาศาสตร์รอบตัว"></div><div class="field"><label for="class-section">ชั้นเรียน / กลุ่ม</label><input id="class-section" v-model="section" maxlength="100" :disabled="pending" placeholder="เช่น ม.2/1"></div></template>
      <div v-else class="field"><label for="class-code">รหัสห้องเรียน</label><input id="class-code" v-model="code" required minlength="6" maxlength="20" pattern="[A-Za-z0-9]{6,20}" :disabled="pending" autocapitalize="characters" autocomplete="off" placeholder="กรอกรหัสที่ได้รับจากครู"></div>
      <p v-if="error" class="error-message" role="alert">{{ error }}</p><div class="form-actions"><button class="button primary" :disabled="pending">{{ pending ? 'กำลังดำเนินการ…' : teacher ? 'สร้างห้องเรียน' : 'เข้าร่วม' }}</button><button class="button subtle" type="button" :disabled="pending" @click="showForm = false">ยกเลิก</button></div>
    </form>
    <p v-if="status === 'pending'" class="loading-text" role="status">กำลังโหลดห้องเรียน…</p>
    <div v-else-if="loadError" class="error-message" role="alert"><p>{{ apiErrorMessage(loadError) }}</p><button class="button subtle" @click="refresh()">ลองอีกครั้ง</button></div>
    <template v-else>
      <div v-if="activeRooms.length" class="classroom-cards"><NuxtLink v-for="room in activeRooms" :key="room.id" :to="`/classes/${room.id}/stream`" class="classroom-card"><div class="classroom-card-band"><span>{{ room.section || 'ห้องเรียน' }}</span><span aria-hidden="true">↗</span></div><div class="classroom-card-body"><h3>{{ room.name }}</h3><p>{{ room.teacher_name }}</p><div class="classroom-card-meta"><span>{{ room.member_count }} นักเรียน</span><span v-if="teacher">ดูห้องเรียน →</span><span v-else>เข้าสู่ห้องเรียน →</span></div></div></NuxtLink></div>
      <div v-else class="empty-state content-card"><span class="empty-icon" aria-hidden="true">↗</span><h3>{{ teacher ? 'เริ่มต้นห้องเรียนแรกของคุณ' : 'ยังไม่มีห้องเรียนที่เปิดอยู่' }}</h3><p>{{ teacher ? 'สร้างห้อง แล้วแบ่งปันรหัสให้นักเรียนเข้ามาเรียนรู้ด้วยกัน' : 'กดเข้าร่วมห้องเรียน แล้วกรอกรหัสที่ได้รับจากครู' }}</p></div>
      <section v-if="archivedRooms.length" class="archived-section"><h3>ห้องเรียนที่เก็บแล้ว</h3><p class="muted">เปิดอ่านประกาศและข้อมูลเดิมได้</p><div class="classroom-cards"><NuxtLink v-for="room in archivedRooms" :key="room.id" :to="`/classes/${room.id}/stream`" class="classroom-card archived"><div class="classroom-card-body"><span class="small-label">เก็บแล้ว</span><h3>{{ room.name }}</h3><p>{{ room.section }} · {{ room.teacher_name }}</p></div></NuxtLink></div></section>
    </template>
  </section>
</template>
