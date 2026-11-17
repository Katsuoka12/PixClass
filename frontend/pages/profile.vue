<script setup lang="ts">
import type { TelegramLink } from '~/types/api';

useHead({ title: 'โปรไฟล์ · Student Tag' });
const auth = useAuth();
const telegram = useTelegram();
const roles = { admin: 'ผู้ดูแลระบบ', teacher: 'ครู', student: 'นักเรียน' };
const { data, error, status, refresh } = await useAsyncData('telegram-profile', () => telegram.status());
const connection = computed(() => data.value?.data);
const linking = ref(false);
const linkError = ref('');
const link = ref<TelegramLink | null>(null);
const telegramUrl = computed(() => {
  if (!link.value) return null;
  try {
    const url = new URL(link.value.url);
    return url.protocol === 'https:' && url.hostname === 't.me' && !url.username && !url.password && !url.port ? url.href : null;
  } catch { return null; }
});
watch(() => connection.value?.connected, connected => { if (connected) link.value = null; });

async function createLink() {
  linking.value = true;
  linkError.value = '';
  link.value = null;
  try {
    link.value = (await telegram.link()).data;
    if (!telegramUrl.value) {
      link.value = null;
      linkError.value = 'เปิดลิงก์ Telegram ไม่ได้ กรุณาลองใหม่';
    }
  } catch (cause) { linkError.value = apiErrorMessage(cause); }
  finally { linking.value = false; }
}
</script>

<template>
  <div class="workspace"><WorkspaceHeader />
    <main id="main-content" class="dashboard profile-page">
      <NuxtLink to="/" class="back-link">← ห้องเรียนทั้งหมด</NuxtLink>
      <div class="dashboard-heading"><div><span class="eyebrow">พื้นที่ของคุณ</span><h1>โปรไฟล์</h1><p class="muted">ข้อมูลบัญชีและช่องทางรับข่าวสารจากห้องเรียน</p></div></div>
      <div class="profile-grid">
        <section class="content-card profile-account" aria-labelledby="account-heading">
          <span class="eyebrow">บัญชี Student Tag</span><h2 id="account-heading">ข้อมูลของคุณ</h2>
          <dl v-if="auth.user.value" class="profile-details">
            <div><dt>ชื่อ</dt><dd>{{ auth.user.value.name }}</dd></div>
            <div><dt>อีเมล</dt><dd>{{ auth.user.value.email }}</dd></div>
            <div><dt>บทบาท</dt><dd>{{ roles[auth.user.value.role] }}</dd></div>
          </dl>
        </section>
        <section class="content-card telegram-card" aria-labelledby="telegram-heading">
          <div class="section-heading"><div><span class="eyebrow">ข่าวสารถึงมือคุณ</span><h2 id="telegram-heading">เชื่อมต่อ Telegram</h2></div><button class="button subtle" :disabled="status === 'pending' || linking" @click="refresh()">ตรวจสอบสถานะ</button></div>
          <p class="muted">รับแจ้งเตือนงานใหม่ ประกาศ คะแนน และข้อความเตือนส่งงานจากครู</p>
          <p v-if="status === 'pending'" class="loading-text" role="status">กำลังตรวจสอบการเชื่อมต่อ…</p>
          <div v-else-if="error" class="error-message" role="alert">{{ apiErrorMessage(error) }}</div>
          <template v-else-if="connection">
            <div class="telegram-state" role="status">
              <span class="submission-badge" :class="{ missing: !connection.connected }">{{ connection.connected ? 'เชื่อมต่อแล้ว' : 'ยังไม่ได้เชื่อมต่อ' }}</span>
              <span v-if="connection.connected">{{ connection.muted ? 'พักการแจ้งเตือนอยู่' : 'เปิดรับการแจ้งเตือนแล้ว' }}</span>
            </div>
            <p v-if="!connection.configured" class="telegram-note">ระบบยังไม่ได้ตั้งค่า Telegram Bot กรุณาติดต่อผู้ดูแลระบบเพื่อเปิดใช้งาน</p>
            <template v-if="connection.connected">
              <p class="telegram-note">จัดการการแจ้งเตือนในแชตส่วนตัวกับบอท: ส่ง <code>/mute</code> เพื่อพัก หรือ <code>/unmute</code> เพื่อเปิดรับอีกครั้ง แล้วกดตรวจสอบสถานะ</p>
              <p class="muted">ดูงานด้วย <code>/tasks</code> คะแนนด้วย <code>/grades</code> และห้องเรียนด้วย <code>/classes</code></p>
            </template>
            <template v-else>
              <p class="telegram-note">สร้างลิงก์ แล้วเปิด Telegram เพื่อกด Start ในแชตส่วนตัวกับบอท จากนั้นกลับมาตรวจสอบสถานะที่หน้านี้</p>
              <button class="button primary" :disabled="!connection.configured || linking" @click="createLink">{{ linking ? 'กำลังสร้างลิงก์…' : link ? 'สร้างลิงก์ใหม่' : 'เชื่อมต่อ Telegram' }}</button>
              <div v-if="telegramUrl && link" class="telegram-link-panel" role="status">
                <a :href="telegramUrl" class="button primary" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">เปิด Telegram เพื่อเชื่อมบัญชี ↗</a>
                <p>ลิงก์นี้ใช้ได้ครั้งเดียว หมดอายุ {{ classroomDate(link.expires_at) }}</p>
                <p class="muted">อย่าส่งต่อลิงก์ให้ผู้อื่น การสร้างลิงก์ใหม่จะยกเลิกลิงก์เดิม</p>
              </div>
            </template>
          </template>
          <p v-if="linkError" class="error-message" role="alert">{{ linkError }}</p>
        </section>
      </div>
    </main>
    <footer class="workspace-footer">STUDENT TAG <span>เรียนรู้ • เชื่อมต่อ • เติบโต</span></footer>
  </div>
</template>
