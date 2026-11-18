<script setup lang="ts">
import type { AdminUser } from '~/types/api';

definePageMeta({ middleware: 'role', role: 'admin' });
useHead({ title: 'จัดการผู้ใช้ · Student Tag' });
const admin = useAdmin();
const page = ref(1);
const { data, error, status, refresh } = await useAsyncData('admin-users', () => admin.list(page.value), { watch: [page] });
const roles = { admin: 'ผู้ดูแลระบบ', teacher: 'ครู', student: 'นักเรียน' };
const pages = computed(() => Math.max(1, Math.ceil((data.value?.data.total ?? 0) / 50)));
const creating = ref(false);
const showCreate = ref(false);
const name = ref('');
const email = ref('');
const password = ref('');
const mutationError = ref('');
const success = ref('');
const selected = ref<AdminUser | null>(null);
const updating = ref(false);
const busy = computed(() => creating.value || updating.value);

function closeCreate() { showCreate.value = false; password.value = ''; }
async function createTeacher() {
  if (busy.value) return;
  mutationError.value = ''; success.value = '';
  if (new TextEncoder().encode(password.value).length > 72) {
    mutationError.value = 'รหัสผ่านต้องไม่เกิน 72 ไบต์ (ภาษาไทยประมาณ 3 ไบต์ต่อตัวอักษร)'; return;
  }
  creating.value = true;
  try {
    const result = await admin.createTeacher({ name: name.value, email: email.value, password: password.value });
    success.value = `สร้างบัญชีครู ${result.data.user.name} แล้ว`;
    name.value = ''; email.value = ''; showCreate.value = false;
    page.value = 1;
    await refresh();
  } catch (cause) { mutationError.value = apiErrorMessage(cause); }
  finally { password.value = ''; creating.value = false; }
}
async function confirmStatus() {
  const target = selected.value;
  if (!target || busy.value) return;
  updating.value = true; mutationError.value = ''; success.value = '';
  try {
    await admin.setActive(target.id, !target.is_active);
    success.value = `${target.is_active ? 'ระงับบัญชี' : 'เปิดใช้งานบัญชี'} ${target.name} แล้ว`;
    selected.value = null;
    await refresh();
  } catch (cause) { mutationError.value = apiErrorMessage(cause); }
  finally { updating.value = false; }
}
</script>

<template>
  <div class="workspace"><WorkspaceHeader />
    <main id="main-content" class="dashboard admin-page">
      <div class="dashboard-heading"><div><span class="eyebrow">ดูแลพื้นที่การเรียนรู้</span><h1>จัดการผู้ใช้</h1><p class="muted">สร้างบัญชีครูและจัดการสถานะการเข้าใช้งาน</p></div><button class="button primary" :disabled="busy" @click="showCreate = true">สร้างบัญชีครู</button></div>
      <section v-if="showCreate" class="content-card admin-create" aria-labelledby="create-teacher-heading">
        <h2 id="create-teacher-heading">บัญชีครูใหม่</h2><p class="muted">ส่งอีเมลและรหัสผ่านให้ครูผ่านช่องทางส่วนตัวหลังสร้างบัญชี</p>
        <form class="admin-create-form" :aria-busy="creating" @submit.prevent="createTeacher">
          <div class="field"><label for="teacher-name">ชื่อ–นามสกุล</label><input id="teacher-name" v-model="name" name="name" autocomplete="name" maxlength="100" required :disabled="busy"></div>
          <div class="field"><label for="teacher-email">อีเมล</label><input id="teacher-email" v-model="email" name="email" type="email" autocomplete="off" maxlength="254" required :disabled="busy"></div>
          <div class="field"><label for="teacher-password">รหัสผ่านเริ่มต้น</label><input id="teacher-password" v-model="password" name="password" type="password" autocomplete="new-password" minlength="8" required :disabled="busy" aria-describedby="teacher-password-help"><small id="teacher-password-help">อย่างน้อย 8 ตัวอักษร ไม่เกิน 72 ไบต์ รหัสผ่านจะไม่แสดงในรายชื่อผู้ใช้</small></div>
          <div class="form-actions"><button class="button primary" type="submit" :disabled="busy">{{ creating ? 'กำลังสร้างบัญชี…' : 'สร้างบัญชีครู' }}</button><button class="button subtle" type="button" :disabled="busy" @click="closeCreate">ยกเลิก</button></div>
        </form>
      </section>
      <p v-if="mutationError" class="error-message" role="alert">{{ mutationError }}</p><p v-if="success" class="success-message" role="status">{{ success }}</p>
      <section v-if="selected" class="content-card admin-confirm" aria-labelledby="status-confirm-heading">
        <h2 id="status-confirm-heading">{{ selected.is_active ? 'ระงับบัญชีนี้หรือไม่' : 'เปิดใช้งานบัญชีนี้อีกครั้งหรือไม่' }}</h2>
        <p><strong>{{ selected.name }}</strong> · {{ selected.email }}</p><p class="muted">{{ selected.is_active ? 'ผู้ใช้นี้จะเข้าสู่ระบบและใช้งานต่อไม่ได้ทันที รวมถึงเซสชันที่เปิดอยู่' : 'ผู้ใช้นี้จะกลับเข้าสู่ระบบด้วยบัญชีเดิมได้' }}</p>
        <div class="form-actions"><button class="button" :class="selected.is_active ? 'danger' : 'primary'" :disabled="busy" @click="confirmStatus">{{ updating ? 'กำลังบันทึก…' : selected.is_active ? 'ยืนยันระงับบัญชี' : 'ยืนยันเปิดใช้งาน' }}</button><button class="button subtle" :disabled="busy" @click="selected = null">ยกเลิก</button></div>
      </section>
      <section aria-labelledby="users-heading"><div class="section-heading"><h2 id="users-heading">รายชื่อผู้ใช้ <span class="muted">{{ data?.data.total ?? 0 }} คน</span></h2><button class="button subtle" :disabled="status === 'pending' || busy" @click="refresh()">โหลดใหม่</button></div>
        <p v-if="status === 'pending'" class="loading-text" role="status">กำลังโหลดรายชื่อ…</p><p v-else-if="error" class="error-message" role="alert">{{ apiErrorMessage(error) }}</p>
        <template v-else-if="data"><div class="admin-table-wrap" tabindex="0" role="region" aria-label="ตารางผู้ใช้ เลื่อนแนวนอนเพื่อดูข้อมูลทั้งหมด"><table class="admin-table"><caption>หน้า {{ data.data.page }} จาก {{ pages }} · หน้าละไม่เกิน 50 คน</caption><thead><tr><th scope="col">ชื่อ / อีเมล</th><th scope="col">บทบาท</th><th scope="col">สร้างเมื่อ</th><th scope="col">สถานะ</th><th scope="col">จัดการ</th></tr></thead><tbody><tr v-for="person in data.data.users" :key="person.id"><th scope="row"><span>{{ person.name }}</span><small>{{ person.email }}</small></th><td>{{ roles[person.role] }}</td><td>{{ classroomDate(person.created_at) }}</td><td><span class="submission-badge" :class="{ missing: !person.is_active }">{{ person.is_active ? 'ใช้งานอยู่' : 'ถูกระงับ' }}</span></td><td><span v-if="person.role === 'admin'" class="muted">บัญชีผู้ดูแลได้รับการป้องกัน</span><button v-else class="button subtle" :disabled="busy" :aria-label="`${person.is_active ? 'ระงับบัญชี' : 'เปิดใช้งาน'} ${person.name}`" @click="selected = person; mutationError = ''; success = ''">{{ person.is_active ? 'ระงับบัญชี' : 'เปิดใช้งาน' }}</button></td></tr><tr v-if="!data.data.users.length"><td colspan="5">ไม่มีผู้ใช้ในหน้านี้</td></tr></tbody></table></div>
          <nav class="admin-pagination" aria-label="หน้ารายชื่อผู้ใช้"><button class="button subtle" :disabled="page <= 1 || busy" @click="page--">← หน้าก่อน</button><span>หน้า {{ page }} / {{ pages }}</span><button class="button subtle" :disabled="page >= pages || busy" @click="page++">หน้าถัดไป →</button></nav>
        </template>
      </section>
    </main><footer class="workspace-footer">STUDENT TAG <span>เรียนรู้ • เชื่อมต่อ • เติบโต</span></footer>
  </div>
</template>
