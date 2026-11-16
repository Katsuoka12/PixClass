# Student Tag Web — M3

Nuxt stable 4.6.4 + Vue 3 Composition API + strict TypeScript ใช้ Node 24 LTS >=24.15.0 ติดตั้งแยกจาก backend:

```sh
npm install
cp .env.example .env
npm run dev
npm run typecheck
npm run build
npm run preview
```

dev ที่ http://localhost:3000 เรียก `/api/*` ผ่าน `nitro.devProxy` ไป `API_PROXY_TARGET=http://localhost:4000` อย่าใส่ `/api` ต่อท้าย API_PROXY_TARGET ส่วน SSR เรียก Express โดยตรงและ forward เฉพาะ incoming cookie การเรียกภายใน Nitro ไม่ผ่าน devProxy

production ต้องมี reverse proxy `/api/*` ไป Express และตั้ง private `NUXT_API_SERVER_BASE=http://127.0.0.1:4000/api` หาก API เปลี่ยนที่อยู่ ค่า `NUXT_PUBLIC_API_BASE=/api` อยู่ฝั่งเบราว์เซอร์ เก็บ WEB_URL ของ backend ให้ตรง public origin ที่เข้าเว็บ

หน้า `/login`, `/register`, `/` (redirect ตาม role), `/admin`, `/teacher`, `/student` มี route guard สำหรับ UX ทุก role landing เรียก protected overview endpoint ของ API อีกชั้นหนึ่ง ครู/นักเรียนมีรายการห้องและฟอร์มสร้าง/เข้าร่วม ห้องอยู่ที่ `/classes/:id/stream`, `/classwork`, `/people`, `/grades` (ครูเท่านั้น) เปิด `/classes/:id` จะไปสตรีม การทำ business logic และบังคับสิทธิ์อยู่ backend

`types/api.ts` เขียนตาม [../docs/api.md](../docs/api.md) ไม่มี import type/code จาก backend ไม่มี dependency แชร์กัน ไม่มี `v-html`, analytics, remote fonts หรือ external asset requests ข้อความประกาศ/คำตอบ/คอมเมนต์แสดงแบบ plain text รักษาบรรทัดใหม่ เวลาแสดงโซน Asia/Bangkok รหัสห้องแสดงเฉพาะครูเจ้าของห้องที่ยังเปิดอยู่

M3: แท็บงานมีฟอร์มสร้างงานและรายการจริง `/assignments/:id` แสดงรายละเอียด/แก้ไข/ลบสำหรับครู นักเรียนส่งและแก้ข้อความ/ไฟล์ก่อนตรวจ ครูเห็นรายการส่งและให้คะแนน `/classes/:id/grades` มี Gradebook นักเรียน×งาน และ `/todo` เป็นงานของฉันสำหรับ student เท่านั้น API ตรวจสิทธิ์จริงทุกครั้ง

กำหนดส่งในฟอร์ม datetime-local ใช้ timezone ของอุปกรณ์ครูและส่ง ISO UTC ไป API คำตอบส่งเป็น JSON หรือ FormData โดยไม่ตั้ง multipart Content-Type เอง ไฟล์เดิมเก็บไว้จนเลือกแทน/ลบ จำกัดชนิด/ขนาดฝั่ง UI เพื่อช่วยผู้ใช้ และ backend ตรวจจริงซ้ำ Browser timeout สำหรับไฟล์ 120 วินาที คะแนน 0 แสดงได้และปิดการแก้คำตอบเช่นเดียวกับคะแนนอื่น แก้กำหนดส่งแล้วรายการส่งช้า refresh ตาม API

สีตามพาเลตผู้ใช้: พื้น `#F3F6F4`, รอง `#7D8D39`, ปุ่มหลัก `#5B6E2C`, เน้น `#FF5A22` ใช้ label, focus ring, loading/disabled/error states และ layout มือถือ/desktop ฟอนต์หลัก **Anuphan (อนุพันธ์)** แบบ variable น้ำหนัก 100–700 เก็บที่ `public/fonts/anuphan-variable.ttf` ใช้ `@font-face` + `font-display: swap` และ preload ใน Nuxt ไม่เรียก font CDN และมี system font สำรอง

ไฟล์ฟอนต์ต้นฉบับจาก [Google Fonts / Anuphan](https://github.com/google/fonts/tree/main/ofl/anuphan) โดย The Anuphan Project Authors (Cadson Demak) แจกจ่ายตาม SIL Open Font License 1.1 แนบที่ `public/fonts/Anuphan-OFL.txt` โดยไม่แก้ไขไฟล์ฟอนต์ ไม่เพิ่ม npm dependency

บัญชีและรหัส seed ดู README ราก ข้อจำกัด dependency audit ดู docs/m1-verification.md
