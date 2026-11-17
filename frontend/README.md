# Student Tag Web — M5

Nuxt stable 4.6.4 + Vue 3 Composition API + strict TypeScript ใช้ Node 24 LTS >=24.15.0 ติดตั้งแยกจาก backend:

```sh
npm install
cp .env.example .env
npm run dev
npm run typecheck
npm test
npm run build
npm run preview
```

dev ที่ http://localhost:3000 เรียก `/api/*` ผ่าน `nitro.devProxy` ไป `API_PROXY_TARGET=http://localhost:4000` อย่าใส่ `/api` ต่อท้าย API_PROXY_TARGET ส่วน SSR เรียก Express โดยตรงและ forward เฉพาะ incoming cookie การเรียกภายใน Nitro ไม่ผ่าน devProxy

production ต้องมี reverse proxy `/api/*` ไป Express และตั้ง private `NUXT_API_SERVER_BASE=http://127.0.0.1:4000/api` หาก API เปลี่ยนที่อยู่ ค่า `NUXT_PUBLIC_API_BASE=/api` อยู่ฝั่งเบราว์เซอร์ เก็บ WEB_URL ของ backend ให้ตรง public origin ที่เข้าเว็บ

หน้า `/login`, `/register`, `/` (redirect ตาม role), `/admin`, `/teacher`, `/student` มี route guard สำหรับ UX ทุก role landing เรียก protected overview endpoint ของ API อีกชั้นหนึ่ง ครู/นักเรียนมีรายการห้องและฟอร์มสร้าง/เข้าร่วม ห้องอยู่ที่ `/classes/:id/stream`, `/classwork`, `/people`, `/grades` (ครูเท่านั้น) เปิด `/classes/:id` จะไปสตรีม การทำ business logic และบังคับสิทธิ์อยู่ backend

`types/api.ts` เขียนตาม [../docs/api.md](../docs/api.md) ไม่มี import type/code จาก backend ไม่มี dependency แชร์กัน ไม่มี `v-html`, analytics, remote fonts หรือ external asset requests ข้อความประกาศ/คำตอบ/คอมเมนต์แสดงแบบ plain text รักษาบรรทัดใหม่ เวลาแสดงโซน Asia/Bangkok รหัสห้องแสดงเฉพาะครูเจ้าของห้องที่ยังเปิดอยู่

M3: แท็บงานมีฟอร์มสร้างงานและรายการจริง `/assignments/:id` แสดงรายละเอียด/แก้ไข/ลบสำหรับครู นักเรียนส่งและแก้ข้อความ/ไฟล์ก่อนตรวจ ครูเห็นรายการส่งและให้คะแนน `/classes/:id/grades` มี Gradebook นักเรียน×งาน และ `/todo` เป็นงานของฉันสำหรับ student เท่านั้น API ตรวจสิทธิ์จริงทุกครั้ง

M4: `/profile` ใช้ได้ทุก role ที่ login แสดงสถานะ Telegram และสร้างลิงก์ใช้ครั้งเดียว ผู้ใช้กด anchor เปิด t.me เองหลัง API ตอบ (ไม่ใช้ popup ที่เบราว์เซอร์อาจบล็อก) ไม่บันทึก link token ใน localStorage หรือ log ตรวจสถานะหลังกลับจากบอท หาก backend ไม่ตั้ง credentials จะปิดปุ่มเชื่อม พร้อมคำแนะนำ การ mute/unmute ใช้คำสั่งในบอท

หน้างานครูมีปุ่มเตือนคนที่ยังไม่ส่ง ปิดเมื่อไม่มีคนค้าง/ห้องเก็บแล้ว/กำลังส่ง สรุปจำนวนส่งสำเร็จ ไม่เชื่อม mute ล้มเหลวและข้าม ไม่มีรายชื่อ/ข้อมูล chat ใน response ใช้ timeout 120 วินาที การตรวจ ownership และ missing recipients อยู่ backend ทั้งหมด `useTelegram.ts` และ types ตรงกับ M4 contract ไม่มีการ import ข้าม backend

M5 เพิ่ม `ClassLive.vue` ในสตรีม, `/live/join` และ `/live/:id/attendance` ครูเริ่ม/จบ/ดูเช็คชื่อ/เตือนคนขาด นักเรียนขอลิงก์เฉพาะตนจากห้องได้แม้ไม่ใช้ Telegram Auth redirect ยอมรับเฉพาะ `/live/join?t=<64hex>` พร้อม tests ป้องกัน open redirect และ URL injection

หน้า join ไม่เรียก check-in ระหว่าง SSR รอผู้ใช้กดเข้า นำ token ออกจาก URL ก่อนส่ง custom-header GET ไป API และโหลด external_api.js ชื่อแสดง/สื่อที่เลือกเปิดส่งไปยัง Jitsi หลังผู้ใช้ยืนยัน มี no-referrer, กล้อง/ไมค์เริ่มปิด, script timeout10s, Jitsi listeners/dispose และ fallbackแท็บใหม่ ตรวจ session ทุก15s ปิด iframeเมื่อจบ/หมดสิทธิ์ ออกจากหน้าส่ง beacon JSON แบบ best effort ไม่เก็บ tokenในlocalStorage เช็คชื่อหน้าเว็บไม่ใช่ระยะเวลาวิดีโอจริงหรือหลักฐานยืนยันตัวบุคคล หลายแท็บ/แท็บใหม่มีข้อจำกัดตาม README ราก

กำหนดส่งในฟอร์ม datetime-local ใช้ timezone ของอุปกรณ์ครูและส่ง ISO UTC ไป API คำตอบส่งเป็น JSON หรือ FormData โดยไม่ตั้ง multipart Content-Type เอง ไฟล์เดิมเก็บไว้จนเลือกแทน/ลบ จำกัดชนิด/ขนาดฝั่ง UI เพื่อช่วยผู้ใช้ และ backend ตรวจจริงซ้ำ Browser timeout สำหรับไฟล์ 120 วินาที คะแนน 0 แสดงได้และปิดการแก้คำตอบเช่นเดียวกับคะแนนอื่น แก้กำหนดส่งแล้วรายการส่งช้า refresh ตาม API

สีตามพาเลตผู้ใช้: พื้น `#F3F6F4`, รอง `#7D8D39`, ปุ่มหลัก `#5B6E2C`, เน้น `#FF5A22` ใช้ label, focus ring, loading/disabled/error states และ layout มือถือ/desktop ฟอนต์หลัก **Anuphan (อนุพันธ์)** แบบ variable น้ำหนัก 100–700 เก็บที่ `public/fonts/anuphan-variable.ttf` ใช้ `@font-face` + `font-display: swap` และ preload ใน Nuxt ไม่เรียก font CDN และมี system font สำรอง

ไฟล์ฟอนต์ต้นฉบับจาก [Google Fonts / Anuphan](https://github.com/google/fonts/tree/main/ofl/anuphan) โดย The Anuphan Project Authors (Cadson Demak) แจกจ่ายตาม SIL Open Font License 1.1 แนบที่ `public/fonts/Anuphan-OFL.txt` โดยไม่แก้ไขไฟล์ฟอนต์ ไม่เพิ่ม npm dependency

บัญชีและรหัส seed ดู README ราก ข้อจำกัด dependency audit ดู docs/m1-verification.md
