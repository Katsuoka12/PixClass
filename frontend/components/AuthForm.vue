<script setup lang="ts">
const props = defineProps<{ mode: 'login' | 'register' }>();
const auth = useAuth();
const name = ref('');
const email = ref('');
const password = ref('');
const pending = ref(false);
const error = ref('');
const isRegister = computed(() => props.mode === 'register');

async function submit() {
  if (pending.value) return;
  error.value = '';
  if (new TextEncoder().encode(password.value).length > 72) {
    error.value = 'รหัสผ่านต้องยาวไม่เกิน 72 ไบต์ (ภาษาไทยใช้ประมาณ 3 ไบต์ต่อตัวอักษร)';
    return;
  }
  pending.value = true;
  try {
    if (isRegister.value) await auth.register({ name: name.value, email: email.value, password: password.value });
    else await auth.login({ email: email.value, password: password.value });
    await navigateTo(`/${auth.user.value!.role}`);
  } catch (cause) {
    error.value = apiErrorMessage(cause);
  } finally { pending.value = false; }
}
</script>

<template>
  <main class="auth-shell">
    <aside class="auth-story" aria-label="เกี่ยวกับ Student Tag">
      <BrandMark />
      <div class="story-body">
        <span class="eyebrow">ห้องเรียนที่เชื่อมถึงกัน</span>
        <h1>ทุกการเรียนรู้<br>เริ่มต้นที่<span class="orange-text">นี่.</span></h1>
        <p>พื้นที่ของครูและนักเรียน<br>ให้ทุกก้าวของการเรียนรู้ไปด้วยกัน</p>
        <div class="notebook" aria-hidden="true">
          <div class="notebook-heading"><span>บันทึกการเรียนรู้</span><span class="notebook-tag">ของเรา</span></div>
          <div class="notebook-line"><span class="check">✓</span> เรียนรู้สิ่งใหม่ในทุกวัน</div>
          <div class="notebook-line"><span class="check">✓</span> เติบโตไปพร้อมกัน</div>
          <div class="notebook-line"><span class="empty-check" /> เริ่มต้นบทเรียนถัดไป</div>
          <span class="notebook-sticker">ไปด้วยกัน ↗</span>
        </div>
      </div>
      <p class="story-footer">ความรู้เติบโต เมื่อเราแบ่งปัน</p>
    </aside>
    <section class="auth-panel">
      <div class="auth-mobile-brand"><BrandMark /></div>
      <div class="auth-form-wrap">
        <span class="eyebrow">{{ isRegister ? 'เริ่มต้นเป็นส่วนหนึ่งของห้องเรียน' : 'ยินดีต้อนรับกลับสู่ห้องเรียน' }}</span>
        <h2>{{ isRegister ? 'สร้างบัญชีนักเรียน' : 'เข้าสู่ระบบ' }}</h2>
        <p class="muted">{{ isRegister ? 'กรอกข้อมูลของคุณเพื่อเริ่มต้นใช้งาน' : 'พร้อมสำหรับการเรียนรู้ครั้งใหม่แล้วหรือยัง' }}</p>
        <form class="auth-form" :aria-busy="pending" @submit.prevent="submit">
          <div v-if="isRegister" class="field"><label for="name">ชื่อ–นามสกุล</label><input id="name" v-model="name" name="name" autocomplete="name" maxlength="100" required :disabled="pending"></div>
          <div class="field"><label for="email">อีเมล</label><input id="email" v-model="email" name="email" type="email" autocomplete="username" maxlength="254" placeholder="you@example.com" required :disabled="pending"></div>
          <div class="field"><label for="password">รหัสผ่าน</label><input id="password" v-model="password" name="password" type="password" :autocomplete="isRegister ? 'new-password' : 'current-password'" minlength="8" maxlength="72" required :disabled="pending" :aria-describedby="isRegister ? 'password-hint' : undefined"><small v-if="isRegister" id="password-hint">อย่างน้อย 8 ตัวอักษร และไม่เกิน 72 ไบต์</small></div>
          <p v-if="error" class="error-message" role="alert">{{ error }}</p>
          <button class="button primary" type="submit" :disabled="pending">{{ pending ? 'กำลังดำเนินการ…' : isRegister ? 'สร้างบัญชี' : 'เข้าสู่ระบบ' }}<span aria-hidden="true">↗</span></button>
        </form>
        <p class="auth-switch">{{ isRegister ? 'มีบัญชีอยู่แล้ว?' : 'ยังไม่มีบัญชี?' }} <NuxtLink :to="isRegister ? '/login' : '/register'">{{ isRegister ? 'เข้าสู่ระบบ' : 'สมัครเป็นนักเรียน' }}</NuxtLink></p>
        <div class="auth-note"><span class="note-dot" /><p>บัญชีครูและผู้ดูแลระบบ<br>รับจากผู้ดูแลของสถานศึกษา</p></div>
      </div>
      <p class="panel-footer">STUDENT TAG <span>เรียนรู้ • เชื่อมต่อ • เติบโต</span></p>
    </section>
  </main>
</template>
