<script setup lang="ts">
import type { Classroom } from '~/types/api';
const route = useRoute();
const auth = useAuth();
const classrooms = useClassrooms();
const id = computed(() => Number(route.params.id));
if (!Number.isInteger(id.value) || id.value < 1 || id.value > 4294967295) throw createError({ statusCode: 404, message: 'ไม่พบห้องเรียน' });
const { data, error: loadError } = await useAsyncData(() => `classroom-${id.value}`, () => classrooms.get(id.value));
if (loadError.value || !data.value) classroomError(loadError.value);
const room = computed(() => data.value!.data.class);
const teacher = computed(() => auth.user.value?.role === 'teacher' && auth.user.value.id === room.value.teacher_id);
const editing = ref(false);
const name = ref('');
const section = ref('');
const pending = ref(false);
const error = ref('');
const archiveConfirm = ref(false);
useHead({ title: () => `${room.value.name} · Student Tag` });
function edit() { name.value = room.value.name; section.value = room.value.section; editing.value = !editing.value; error.value = ''; }
async function update(input: { name?: string; section?: string; archived?: true }) {
  if (pending.value) return;
  pending.value = true;
  error.value = '';
  try { data.value = await classrooms.update(id.value, input); editing.value = false; archiveConfirm.value = false; }
  catch (cause) { error.value = apiErrorMessage(cause); }
  finally { pending.value = false; }
}
const tabs = computed(() => [
  { path: 'stream', label: 'สตรีม' }, { path: 'classwork', label: 'งานในชั้นเรียน' },
  { path: 'people', label: 'บุคคล' }, ...(teacher.value ? [{ path: 'grades', label: 'คะแนน' }] : []),
]);
</script>

<template>
  <div class="workspace"><WorkspaceHeader /><main v-if="data" class="dashboard classroom-page">
    <NuxtLink to="/" class="back-link">← ห้องเรียนทั้งหมด</NuxtLink>
    <section class="classroom-banner"><div><span class="eyebrow">{{ room.section || 'ห้องเรียนของเรา' }}</span><h1>{{ room.name }}</h1><p>ครูผู้สอน · {{ room.teacher_name }}</p></div><div v-if="teacher && room.join_code && !room.archived" class="join-code"><span>รหัสห้องเรียน</span><strong>{{ room.join_code }}</strong><small>แบ่งปันรหัสนี้ให้นักเรียน</small></div></section>
    <p v-if="room.archived" class="archive-notice" role="status">ห้องเรียนนี้ถูกเก็บแล้ว คุณยังอ่านข้อมูลเดิมได้</p>
    <div v-if="teacher && !room.archived" class="classroom-tools"><button class="button subtle" :aria-expanded="editing" @click="edit">{{ editing ? 'ปิดการแก้ไข' : 'แก้ไขห้องเรียน' }}</button><button class="button subtle" :disabled="pending" @click="archiveConfirm = !archiveConfirm">เก็บห้องเรียน</button></div>
    <p v-if="error" class="error-message" role="alert">{{ error }}</p>
    <div v-if="archiveConfirm && !room.archived" class="archive-confirm content-card"><h2>เก็บห้องเรียนนี้หรือไม่?</h2><p>สมาชิกยังอ่านข้อมูลเดิมได้ แต่จะเข้าร่วม โพสต์ประกาศ หรือแก้ไขห้องไม่ได้</p><div class="form-actions"><button class="button primary" :disabled="pending" @click="update({ archived: true })">{{ pending ? 'กำลังเก็บ…' : 'ยืนยันเก็บห้องเรียน' }}</button><button class="button subtle" :disabled="pending" @click="archiveConfirm = false">ยกเลิก</button></div></div>
    <form v-if="editing && !room.archived" class="classroom-form content-card" @submit.prevent="update({ name, section })"><h2>แก้ไขรายละเอียดห้องเรียน</h2><div class="field"><label for="edit-name">ชื่อห้องเรียน</label><input id="edit-name" v-model="name" required maxlength="200" :disabled="pending"></div><div class="field"><label for="edit-section">ชั้นเรียน / กลุ่ม</label><input id="edit-section" v-model="section" maxlength="100" :disabled="pending"></div><button class="button primary" :disabled="pending">{{ pending ? 'กำลังบันทึก…' : 'บันทึกการเปลี่ยนแปลง' }}</button></form>
    <nav class="classroom-tabs" aria-label="ส่วนของห้องเรียน"><NuxtLink v-for="tab in tabs" :key="tab.path" :to="`/classes/${room.id}/${tab.path}`">{{ tab.label }}</NuxtLink></nav>
    <NuxtPage :key="`${room.id}-${room.archived}`" :classroom="room as Classroom" />
  </main><footer class="workspace-footer">STUDENT TAG <span>เรียนรู้ • เชื่อมต่อ • เติบโต</span></footer></div>
</template>
