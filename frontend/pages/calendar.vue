<script setup lang="ts">
import type { CalendarItem } from '~/types/api';
import { bangkokDate, calendarDays, currentBangkokMonth, shiftMonth, validMonth } from '~/utils/calendar';

definePageMeta({ middleware: 'calendar' });
useHead({ title: 'ปฏิทินงาน · Student Tag' });
const auth = useAuth();
const calendar = useCalendar();
const month = useState('calendar-selected-month', () => currentBangkokMonth());
const today = useState('calendar-today', () => bangkokDate(new Date().toISOString()));
const inputError = ref('');
const { data, status, error, refresh } = await useAsyncData(() => `calendar-${month.value}`, () => calendar.month(month.value));
const previous = computed(() => shiftMonth(month.value, -1));
const next = computed(() => shiftMonth(month.value, 1));
const monthLabel = computed(() => new Date(`${month.value}-01T00:00:00Z`).toLocaleDateString('th-TH', { month: 'long', year: 'numeric', timeZone: 'UTC' }));
const weeks = computed(() => {
  const days = calendarDays(month.value);
  return Array.from({ length: days.length / 7 }, (_, index) => days.slice(index * 7, index * 7 + 7));
});
const groups = computed(() => {
  const grouped = new Map<string, CalendarItem[]>();
  for (const item of data.value?.data.items ?? []) {
    const day = bangkokDate(item.assignment.due_at);
    if (day?.startsWith(`${month.value}-`)) grouped.set(day, [...(grouped.get(day) ?? []), item]);
  }
  return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, items]) => ({ day, items: items.sort((a, b) => a.assignment.due_at!.localeCompare(b.assignment.due_at!)) }));
});
const byDay = computed(() => new Map(groups.value.map(group => [group.day, group.items])));
function dayLabel(day: string) { return new Date(`${day}T00:00:00Z`).toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }); }
function timeLabel(due: string | null) { return due ? new Date(due).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' }) : ''; }
function changeMonth(value: string | null) {
  if (!validMonth(value)) { inputError.value = 'เลือกเดือนระหว่างปี 2000 ถึง 2100'; return; }
  inputError.value = ''; month.value = value;
}
</script>

<template>
  <div class="workspace"><WorkspaceHeader />
    <main id="main-content" class="dashboard calendar-page">
      <NuxtLink to="/" class="back-link">← ห้องเรียนทั้งหมด</NuxtLink>
      <div class="dashboard-heading"><div><span class="eyebrow">มองภาพรวมการเรียนรู้</span><h1>ปฏิทินงาน</h1><p class="muted">กำหนดส่งจากห้องเรียนของคุณ · เวลาไทย (Asia/Bangkok)</p></div><NuxtLink v-if="auth.user.value?.role === 'student'" to="/todo" class="button subtle">ดูงานของฉัน →</NuxtLink></div>
      <div class="calendar-toolbar"><div class="calendar-month-controls"><button class="button subtle" :disabled="!previous || status === 'pending'" aria-label="เดือนก่อนหน้า" @click="changeMonth(previous)">←</button><h2 id="calendar-month-heading">{{ monthLabel }}</h2><button class="button subtle" :disabled="!next || status === 'pending'" aria-label="เดือนถัดไป" @click="changeMonth(next)">→</button></div><div class="calendar-picker"><label for="calendar-month">เลือกเดือน</label><input id="calendar-month" type="month" min="2000-01" max="2100-12" :value="month" :disabled="status === 'pending'" @change="changeMonth(($event.target as HTMLInputElement).value)"><button class="button subtle" :disabled="status === 'pending'" @click="changeMonth(currentBangkokMonth())">เดือนนี้</button></div></div>
      <p v-if="inputError" class="error-message" role="alert">{{ inputError }}</p>
      <p v-if="status === 'pending'" class="loading-text" role="status">กำลังโหลดปฏิทิน…</p>
      <div v-else-if="error" class="error-message" role="alert"><p>{{ apiErrorMessage(error) }}</p><button class="button subtle" @click="refresh()">ลองใหม่</button></div>
      <template v-else>
        <div class="calendar-grid-wrap"><table class="calendar-grid" aria-labelledby="calendar-month-heading"><caption>กำหนดส่งงานตามวันที่ในประเทศไทย</caption><thead><tr><th v-for="weekday in ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.']" :key="weekday" scope="col">{{ weekday }}</th></tr></thead><tbody><tr v-for="(week, index) in weeks" :key="index"><td v-for="(day, dayIndex) in week" :key="day ?? `empty-${index}-${dayIndex}`" :class="{ 'calendar-blank': !day, 'calendar-today': day === today }"><template v-if="day"><time :datetime="day" :aria-label="dayLabel(day)">{{ Number(day.slice(-2)) }}<span v-if="day === today" class="calendar-today-label"> วันนี้</span></time><ul><li v-for="item in byDay.get(day) ?? []" :key="item.assignment.id"><NuxtLink :to="`/assignments/${item.assignment.id}`"><small>{{ timeLabel(item.assignment.due_at) }}</small><span>{{ item.assignment.title }}</span></NuxtLink></li></ul></template></td></tr></tbody></table></div>
        <section class="calendar-agenda" aria-labelledby="agenda-heading"><div class="section-heading"><h2 id="agenda-heading">กำหนดส่งในเดือนนี้</h2><span class="muted">{{ data?.data.items.length ?? 0 }} งาน</span></div>
          <div v-if="!groups.length" class="content-card empty-state"><h3>เดือนนี้ยังไม่มีกำหนดส่ง</h3><p>งานที่ไม่มีกำหนดส่งจะแสดงใน{{ auth.user.value?.role === 'student' ? 'หน้า “งานของฉัน”' : 'หน้างานในชั้นเรียน' }}</p></div>
          <section v-for="group in groups" :key="group.day" class="calendar-day-group"><h3><time :datetime="group.day">{{ dayLabel(group.day) }}</time></h3><div class="assignment-list"><NuxtLink v-for="item in group.items" :key="item.assignment.id" :to="`/assignments/${item.assignment.id}`" class="assignment-card content-card"><div><span class="eyebrow">{{ item.assignment.class_name }}</span><h3>{{ item.assignment.title }}</h3><p class="muted">กำหนดส่ง {{ timeLabel(item.assignment.due_at) }} น. · {{ item.assignment.max_points }} คะแนน</p></div><div v-if="item.status" class="todo-result"><span class="submission-badge" :class="{ late: item.status === 'late', missing: item.status === 'missing' }">{{ assignmentStatus(item.status) }}</span><span v-if="item.submission?.grade != null">{{ item.submission.grade }} / {{ item.assignment.max_points }} คะแนน</span></div></NuxtLink></div></section>
        </section>
      </template>
    </main><footer class="workspace-footer">STUDENT TAG <span>เรียนรู้ • เชื่อมต่อ • เติบโต</span></footer>
  </div>
</template>
