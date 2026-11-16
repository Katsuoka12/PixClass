# AGENTS.md: Student Tag

สเปกและกติกาการทำงานสำหรับ AI coding agent (Codex) ให้อ่านทั้งไฟล์ก่อนเริ่ม และทำตามลำดับ Milestone

## 1. โปรเจกต์คืออะไร

**Student Tag** คือเว็บเรียนออนไลน์สำหรับนักเรียน แนวเดียวกับ Google Classroom
- ครูสร้างห้องเรียน สร้างงาน ตรวจงาน ให้คะแนน และโพสต์ประกาศบนเว็บ
- นักเรียน join ห้องด้วยรหัส ดูงาน ส่งงาน ดูคะแนน
- **Telegram Bot** ส่งข้อความหานักเรียน (งานใหม่ ประกาศ เตือนคนค้างส่ง เรียกเข้า Live Class)
- **Live Class (วิดีโอคอล) อยู่บนเว็บ** โดยฝัง Jitsi Meet ส่วน Telegram ส่งปุ่ม "เข้าเรียน" ไปเปิดห้องบนเว็บ (Telegram Bot API สร้างวิดีโอคอลเองไม่ได้ อย่าพยายามทำ)
- เช็คชื่ออัตโนมัติจากการเข้า-ออกห้อง Live Class

ภาษา UI: **ภาษาไทย** (โค้ด ชื่อตัวแปร ชื่อตาราง คอมเมนต์โค้ด เป็นภาษาอังกฤษ)

## 2. Tech Stack (ห้ามเปลี่ยนโดยไม่ถามก่อน)

| ส่วน | ใช้ |
|---|---|
| Frontend | **Nuxt** (เวอร์ชันเสถียรล่าสุด) + **TypeScript** (`strict`) + Vue 3 Composition API (`<script setup lang="ts">`) |
| Backend | **Node.js (LTS) + TypeScript**, **Express** เป็น REST API (`/api/*`) |
| Validation | `zod` ตรวจ input ทุก endpoint |
| Database | **MariaDB/MySQL จาก XAMPP**, charset `utf8mb4`, ใช้ `mysql2/promise` เขียน SQL ตรง ๆ (ไม่ใช้ ORM) |
| Auth | JWT ใน cookie แบบ `HttpOnly` + `SameSite=Lax`, รหัสผ่านใช้ `bcrypt` (หรือ `argon2`) |
| Telegram | ไลบรารี `grammy` |
| Scheduler | `node-cron` ในโปรเจกต์ API |
| Upload | `multer` |
| Live Class | Jitsi Meet IFrame API (ตั้ง domain ได้ผ่าน `.env`) |
| Package manager | npm (แยก `package.json` ของ `frontend/` และ `backend/`) |

**หมายเหตุเรื่อง XAMPP:** ใช้เฉพาะ **MariaDB และ phpMyAdmin** ส่วน Apache/PHP ไม่ได้ใช้ในโปรเจกต์นี้

## 3. โครงสร้างโปรเจกต์ (แยก Frontend และ Backend ออกจากกันอย่างเด็ดขาด)

```
student-tag/
├─ AGENTS.md
├─ README.md                 # ภาพรวม + วิธีรันทั้งสองฝั่ง
├─ package.json              # สคริปต์ลัดที่เรียกเข้าไปในแต่ละโฟลเดอร์ (ไม่มี dependency ของแอป)
├─ docs/
│  └─ api.md                 # สัญญา (contract) ของ REST API ดูแลโดยฝั่ง backend
├─ database/
│  ├─ schema.sql             # สร้างตารางทั้งหมด (import ผ่าน phpMyAdmin ได้)
│  └─ seed.sql               # ข้อมูลตัวอย่าง
│
├─ backend/                  # [แยกอิสระ] Node.js + Express + TypeScript (REST API + Telegram bot + cron)
│  ├─ package.json
│  ├─ tsconfig.json
│  ├─ .env.example
│  ├─ README.md
│  ├─ src/
│  │  ├─ index.ts            # เริ่มเซิร์ฟเวอร์, bot, cron
│  │  ├─ config.ts           # โหลดและตรวจ .env (zod)
│  │  ├─ db.ts               # mysql2 pool
│  │  ├─ middleware/         # auth, role guard, error handler, rate limit
│  │  ├─ routes/             # auth, classes, announcements, assignments, submissions, live, telegram, admin
│  │  ├─ services/           # notify, attendance, grading, ...
│  │  ├─ bot/                # grammy bot, commands, telegram send helper
│  │  └─ jobs/               # reminders (node-cron)
│  ├─ tests/                 # vitest + supertest
│  └─ uploads/               # ไฟล์ที่นักเรียนอัปโหลด (ห้าม serve ตรง ๆ)
│
└─ frontend/                 # [แยกอิสระ] Nuxt + TypeScript (หน้าเว็บทั้งหมด)
   ├─ package.json
   ├─ nuxt.config.ts
   ├─ tsconfig.json
   ├─ .env.example
   ├─ README.md
   ├─ pages/                 # login, index, classes/[id]/(stream|classwork|people|grades), live/join, admin
   ├─ components/            # แยก UI component ออกจากโลจิก
   ├─ composables/           # useApi, useAuth, ...
   ├─ layouts/
   ├─ middleware/            # route guard ตาม role (เพื่อ UX เท่านั้น)
   └─ types/                 # type ของ response/request ที่เขียนให้ตรงกับ docs/api.md
```

**กฎการแยกโฟลเดอร์ `frontend/` และ `backend/` (บังคับ)**
- **แยกโปรเจกต์อิสระ 100%:** ทั้ง `frontend/` และ `backend/` มี `package.json`, `node_modules`, `tsconfig.json`, `.env.example` และ `README.md` เป็นของตัวเองอย่างสมบูรณ์
- **ห้ามแชร์โค้ดหรือ import ข้ามโฟลเดอร์:** ห้าม `frontend/` import โค้ดหรือ type จาก `backend/` และห้าม `backend/` import จาก `frontend/` ทั้งสองฝั่งสื่อสารกันผ่าน HTTP REST API เท่านั้น
- **API Contract (`docs/api.md`):** เป็นจุดเชื่อมต่อเดียวระหว่างสองฝั่ง ฝั่ง `backend/` มีหน้าที่อัปเดตเส้นทาง, request, response, error code และสิทธิ์ในไฟล์นี้ทุกครั้งที่มีการเปลี่ยนแปลง ส่วน `frontend/` สร้าง `types/` ให้สอดคล้องกับไฟล์นี้
- **การแบ่งหน้าที่ชัดเจน:** Business logic, database query, และการตรวจสอบสิทธิ์ทั้งหมดอยู่ที่ `backend/` เท่านั้น ส่วน `frontend/` รับผิดชอบเฉพาะการแสดงผล (Presentation), UI State และเรียกใช้งาน API

## 4. Environment

แยกไฟล์ตามโฟลเดอร์ (ห้าม commit `.env` จริง ห้าม hardcode secret ในโค้ด)

**`backend/.env.example`**
```
API_PORT=4000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=student_tag
DB_USER=root
DB_PASS=
JWT_SECRET=change-me-long-random
WEB_URL=http://localhost:3000     # ใช้ตั้ง CORS และสร้างลิงก์ในข้อความ Telegram
TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_USERNAME=
TELEGRAM_MODE=polling             # polling (dev) | webhook (prod)
JITSI_DOMAIN=meet.jit.si
NODE_ENV=development
```

**`frontend/.env.example`**
```
NUXT_PUBLIC_API_BASE=/api
API_PROXY_TARGET=http://localhost:4000   # ใช้ตอน dev สำหรับ proxy
```

- โหมดพัฒนา: Nuxt dev server (พอร์ต 3000) **proxy `/api/*` ไปที่ backend (พอร์ต 4000)** เพื่อให้เป็น same-origin และ cookie ทำงานง่าย (ใช้ `routeRules` / `nitro.devProxy` ใน `nuxt.config.ts`)
- **ข้อควรระวัง:** ปุ่ม URL ของ Telegram ใช้ `localhost` ไม่ได้ ตอนทดสอบกับ Telegram จริงต้องตั้ง `WEB_URL` เป็น URL สาธารณะ HTTPS จาก tunnel (ngrok หรือ Cloudflare Tunnel) ที่ชี้มาที่ Nuxt แล้วเขียนวิธีทำใน README
- Telegram ช่วงพัฒนาใช้ long polling ไม่ต้องมี URL สาธารณะ

## 5. Roles

| Role | ทำอะไรได้ |
|---|---|
| `admin` | จัดการผู้ใช้ (MVP: สร้างบัญชีครู, ระงับบัญชี), seed ไว้ 1 คน |
| `teacher` | สร้างห้อง งาน ประกาศ ตรวจงาน Live Class |
| `student` | join ห้อง ส่งงาน ดูคะแนน เข้า Live Class |

ตรวจสิทธิ์ที่ **API ทุก endpoint** (role + ความเป็นเจ้าของห้อง/สมาชิกห้อง) ส่วน route guard ฝั่ง Nuxt เป็นแค่ UX ห้ามพึ่งอย่างเดียว

## 6. Database Schema (เริ่มต้น เพิ่มเติมได้ถ้าจำเป็น)

เขียนเป็น `database/schema.sql` (InnoDB, utf8mb4, foreign key, index ที่จำเป็น)

```sql
users(id, role ENUM('admin','teacher','student'), name, email UNIQUE, password_hash,
      telegram_chat_id NULL UNIQUE, telegram_muted TINYINT DEFAULT 0,
      is_active TINYINT DEFAULT 1, created_at)

classes(id, teacher_id→users, name, section, join_code UNIQUE, archived TINYINT DEFAULT 0, created_at)
class_members(id, class_id→classes, user_id→users, joined_at, UNIQUE(class_id,user_id))

announcements(id, class_id, author_id, body, created_at)

assignments(id, class_id, title, description, due_at DATETIME NULL, max_points INT DEFAULT 100,
            allow_late TINYINT DEFAULT 1, created_at)
submissions(id, assignment_id, student_id, answer_text, file_path NULL, original_name NULL,
            submitted_at, grade DECIMAL(6,2) NULL, feedback TEXT NULL, graded_at NULL,
            UNIQUE(assignment_id, student_id))

live_sessions(id, class_id, title, room_name UNIQUE, scheduled_at NULL, started_at NULL,
              ended_at NULL, created_by)
live_tokens(id, live_session_id, user_id, token CHAR(64) UNIQUE, expires_at, used_at NULL)
live_attendance(id, live_session_id, user_id, joined_at, left_at NULL,
                UNIQUE(live_session_id, user_id))

telegram_link_tokens(id, user_id, token CHAR(32) UNIQUE, expires_at, used_at NULL)
notification_log(id, user_id, kind VARCHAR(30), ref_id INT NULL, payload TEXT,
                 status ENUM('sent','failed','skipped'), error TEXT NULL, created_at)
```

`seed.sql`: admin 1 คน, ครู 1 คน, นักเรียน 4 คน, ห้อง 1 ห้อง, งาน 1-2 งาน (รหัสผ่านตัวอย่างต้อง hash ด้วย bcrypt แล้วระบุรหัสจริงในรายงาน/README)

## 7. API Routes (แนวทาง ปรับชื่อได้ แต่ต้องเป็น REST ที่สม่ำเสมอ)

```
POST /api/auth/register | login | logout     GET /api/auth/me
GET/POST /api/classes                        GET/PATCH /api/classes/:id
POST /api/classes/join                       DELETE /api/classes/:id/members/:userId
GET/POST /api/classes/:id/announcements
GET/POST /api/classes/:id/assignments        GET/PATCH/DELETE /api/assignments/:id
GET/PUT  /api/assignments/:id/submission     (นักเรียน: ดู/ส่ง/แก้ของตัวเอง)
GET      /api/assignments/:id/submissions    (ครู)
PATCH    /api/submissions/:id/grade          (ครู)
POST     /api/assignments/:id/remind         (ครู: เตือนคนที่ยังไม่ส่ง)
GET      /api/classes/:id/gradebook          (ครู)
GET      /api/me/todo                        (งานของฉัน)
POST /api/telegram/link-token                (สร้างลิงก์เชื่อม Telegram)
POST /api/classes/:id/live/start | POST /api/live/:id/end
GET  /api/live/join?t=<token>                (ตรวจ token → ข้อมูลห้อง Jitsi + บันทึกเข้าเรียน)
POST /api/live/:id/leave
GET  /api/live/:id/attendance                (ครู)
POST /api/live/:id/remind-absent             (ครู)
GET/POST/PATCH /api/admin/users              (admin)
```

รูปแบบ response/error ให้สม่ำเสมอ (`{ error: { code, message } }`) และตอบ status code ให้ถูกต้อง

## 8. Milestone

ทำทีละ Milestone จบแล้ว commit และรายงานก่อนไปต่อ ห้ามทำทีเดียวทั้งโปรเจกต์

### M1: โครงโปรเจกต์ + Auth
- ตั้งโปรเจกต์ `backend/` (Express + TS) และ `frontend/` (Nuxt + TS) แยกกัน, ต่อ MariaDB, โหลด `.env` ด้วย zod, สร้าง `docs/api.md`
- `schema.sql` + `seed.sql`
- สมัครสมาชิก (นักเรียน), login/logout, `GET /api/auth/me`, middleware auth + role guard
- frontend: หน้า login/register, route guard, composable `useApi` / `useAuth`, หน้าแรกแยกตาม role

**เสร็จเมื่อ:** import schema+seed ได้, login ได้ทั้ง 3 role, เข้าหน้าที่ไม่มีสิทธิ์แล้วโดนปฏิเสธทั้งฝั่ง API และ UI

### M2: ห้องเรียน + ประกาศ
- ครูสร้าง/แก้/เก็บ (archive) ห้อง สร้าง `join_code` ไม่ซ้ำ
- นักเรียน join ด้วยรหัส, ครูลบนักเรียนออกจากห้อง
- หน้าห้องเรียนมีส่วน **สตรีม / งานในชั้นเรียน / บุคคล / คะแนน (ครู)**
- ครูโพสต์ประกาศ แสดงในสตรีม

**เสร็จเมื่อ:** ครูสร้างห้อง นักเรียน join แล้วเห็นประกาศ

### M3: งาน + ส่งงาน + ให้คะแนน
- ครูสร้าง/แก้/ลบงาน (ชื่อ คำอธิบาย กำหนดส่ง คะแนนเต็ม)
- นักเรียนส่งงาน (ข้อความ และ/หรือไฟล์), แก้ไขได้ก่อนครูตรวจ
- ครูดูรายการส่ง (ส่งแล้ว/ยังไม่ส่ง/ส่งช้า), ให้คะแนน+คอมเมนต์
- นักเรียนเห็นคะแนนและคอมเมนต์, หน้า "งานของฉัน", Gradebook (นักเรียน × งาน)
- Upload: จำกัดชนิด/ขนาด (เช่น pdf, jpg, png, docx ไม่เกิน 10 MB), ตรวจ MIME จริง, เปลี่ยนชื่อไฟล์เป็นสุ่ม, **ดาวน์โหลดผ่าน endpoint ที่ตรวจสิทธิ์** (ครูเจ้าของห้อง หรือเจ้าของไฟล์เท่านั้น)

**เสร็จเมื่อ:** วนครบ สร้างงาน → ส่ง → ตรวจ → เห็นคะแนน

### M4: เชื่อม Telegram
- ปุ่ม "Connect Telegram" ในโปรไฟล์: API สร้าง token แล้วเปิด `https://t.me/<BOT_USERNAME>?start=<token>`
- grammy bot (โหมด polling ตอนพัฒนา) รับ `/start <token>` → บันทึก `telegram_chat_id` และตอบยืนยัน (รองรับ webhook ผ่าน `TELEGRAM_MODE=webhook`)
- ฟังก์ชันกลาง `notify(userId, text, buttons?)` ที่เช็ค `telegram_muted`, ส่ง, และบันทึก `notification_log`
- ส่งอัตโนมัติ: งานใหม่, ประกาศใหม่, คะแนนออก
- ปุ่ม **"เตือนคนที่ยังไม่ส่ง"** ในหน้างานของครู ส่งเฉพาะคนที่ยังไม่ส่ง และแสดงผลว่าสำเร็จกี่คน กี่คนไม่ได้เชื่อม Telegram
- คำสั่งบอท: `/tasks`, `/grades`, `/classes`, `/mute`, `/unmute`
- ถ้าส่งไม่สำเร็จ (เช่น ผู้ใช้บล็อกบอท) ต้องบันทึกและไปต่อ ห้ามให้ระบบล่ม และหน่วงเล็กน้อยเมื่อส่งหลายคนเพื่อเลี่ยง rate limit

**เสร็จเมื่อ:** นักเรียนผูกบัญชีได้ ครูสร้างงานแล้วนักเรียนได้ข้อความ และกดเตือนคนค้างส่งได้

### M5: Live Class + เช็คชื่อ
- ครูกด **Start Live Class** → สร้าง `live_sessions` (ชื่อห้อง Jitsi สุ่มเดาไม่ได้ เช่น `st-<random>`)
- API สร้าง `live_tokens` เฉพาะคน (มีอายุ) แล้วส่ง Telegram พร้อมปุ่ม **[📹 เข้าเรียน]** ชี้ไป `WEB_URL/live/join?t=<token>`
- หน้า Nuxt `live/join`: เรียก API ตรวจ token และสมาชิกห้อง → บันทึก `live_attendance.joined_at` → โหลด Jitsi IFrame API จาก `JITSI_DOMAIN` และแสดงห้อง (ชื่อแสดงเป็นชื่อผู้ใช้)
- นักเรียนที่ไม่ได้เชื่อม Telegram เข้าได้จากปุ่ม "เข้าเรียน" ในหน้าห้อง
- บันทึก `left_at` เมื่อออกห้อง (event ของ Jitsi + `sendBeacon` แบบ best effort)
- ครูกด **จบคาบ** → ตั้ง `ended_at`, แสดงสรุปเช็คชื่อ (ใครเข้า เวลา ใครขาด), ปุ่ม **"แจ้งเตือนคนที่ขาด"**
- ถ้า Jitsi สาธารณะไม่รองรับการฝังหรือบังคับล็อกอินสำหรับผู้ดูแล ให้มีทางสำรองคือปุ่ม "เปิดห้องในแท็บใหม่" และเขียนข้อจำกัดไว้ใน README

**เสร็จเมื่อ:** ครูเริ่มคาบ → นักเรียนกดปุ่มจาก Telegram → เข้าห้อง → หน้าเช็คชื่อแสดงเวลาเข้าถูกต้อง

### M6: แจ้งเตือนอัตโนมัติ + ขัดเกลา
- job `node-cron`: เตือนก่อนหมดเขต (เช่น 24 ชม. และ 3 ชม.) เฉพาะคนที่ยังไม่ส่ง และ **ไม่ส่งซ้ำ** (เช็คจาก `notification_log`)
- หน้า Admin อย่างง่าย: รายชื่อผู้ใช้, สร้างบัญชีครู, ระงับบัญชี
- หน้าปฏิทินงานและหน้า "งานของฉัน"
- README ให้ครบ

## 9. ความปลอดภัย (บังคับ)

- รหัสผ่านใช้ bcrypt/argon2 เท่านั้น
- SQL: **prepared statements (`?` placeholder) เท่านั้น** ห้ามต่อสตริง
- ตรวจ input ทุก endpoint ด้วย zod
- Cookie auth: `HttpOnly`, `SameSite=Lax`, `Secure` เมื่อใช้ HTTPS, JWT อายุสั้น
- เพราะใช้ cookie ต้องป้องกัน CSRF สำหรับ request ที่เปลี่ยนข้อมูล (เช่น ตรวจ `Origin`/`Sec-Fetch-Site` หรือใช้ CSRF token) และตั้ง CORS ให้อนุญาตเฉพาะ `WEB_URL`
- ใช้ `helmet` และ rate limit โดยเฉพาะ login และ register
- Authorization: ตรวจ role และความเป็นเจ้าของ/สมาชิกห้องทุก endpoint
- Token (Telegram link, live) สุ่มด้วย `crypto.randomBytes`, มีวันหมดอายุ, Telegram link ใช้ได้ครั้งเดียว, และห้าม log token
- อย่าใช้ `v-html` กับข้อมูลที่ผู้ใช้กรอก (ป้องกัน XSS)
- ห้ามส่ง stack trace หรือรายละเอียดข้อผิดพลาดให้ผู้ใช้เมื่อ `NODE_ENV=production`
- ข้อมูลนักเรียนเป็นข้อมูลส่วนบุคคล ห้ามส่งออกไปบริการภายนอกนอกจาก Telegram ตามที่ระบุไว้
- XAMPP: ตั้งรหัส root ของ MySQL ก่อนใช้งานจริง และไม่เปิดพอร์ต 3306 ออกอินเทอร์เน็ต

## 10. วิธีทำงาน (สำหรับ Codex)

1. อ่านไฟล์นี้ทั้งหมด ทำทีละ Milestone ตามลำดับ
2. ก่อนเริ่ม Milestone ให้สรุปแผนสั้น ๆ (ไฟล์ที่จะสร้าง/แก้ แยกตาม `backend/` และ `frontend/`)
3. ก่อนใช้ API ของ Nuxt, grammy หรือไลบรารีอื่น ให้ตรวจเอกสารเวอร์ชันที่ติดตั้งจริง อย่าเดาจากความจำ
4. หลังจบแต่ละ Milestone: รัน type check ทั้งสองโฟลเดอร์ (`tsc --noEmit` ใน `backend/` และ `nuxt typecheck` ใน `frontend/`), lint (ถ้ามี), ทดสอบ flow ตามหัวข้อ "เสร็จเมื่อ", เขียน test ของ API สำหรับส่วนที่เกี่ยวกับสิทธิ์และการให้คะแนน (เช่น `vitest` + `supertest`) อัปเดต `docs/api.md` และ README
5. commit ทีละ Milestone ด้วยข้อความสื่อความหมาย (เช่น `feat(m3): assignments and submissions`)
6. ถ้าสเปกไม่ชัดหรือขัดกัน ให้เลือกทางที่ง่ายและปลอดภัยที่สุด แล้วจดข้อสมมติไว้ใน README อย่าถามถี่เกินจำเป็น
7. อย่าเพิ่มฟีเจอร์นอกสเปก และอย่าเปลี่ยน stack
8. เมื่อจบ รายงาน: สิ่งที่ทำเสร็จ, วิธีรัน/ทดสอบ, รหัสผ่านตัวอย่างใน seed, ข้อจำกัดที่ยังมี

## 11. คำสั่งที่ README ต้องมี

```
# ติดตั้ง (แยกกัน)
cd backend  && npm install
cd frontend && npm install

# ฐานข้อมูล: import database/schema.sql และ seed.sql ผ่าน phpMyAdmin (หรือ mysql CLI)

# ตั้งค่า
cp backend/.env.example  backend/.env
cp frontend/.env.example frontend/.env

# รัน (เปิดแยก 2 เทอร์มินัล)
cd backend  && npm run dev     # API พอร์ต 4000
cd frontend && npm run dev     # Nuxt พอร์ต 3000

# ตรวจ
cd backend  && npm run typecheck && npm run test
cd frontend && npm run typecheck
```

## 12. Out of Scope (ยังไม่ต้องทำ)

Quiz ตรวจอัตโนมัติ, Recording, Breakout rooms, Whiteboard, Poll สด, Parent role, Badge/XP, PWA, หลายภาษา, นำเข้าผู้ใช้จาก CSV, ระบบชำระเงิน, Docker/CI

## 13. ข้อมูลอ้างอิงที่ควรตรวจกับเอกสารทางการ

ความสามารถของ Telegram Bot API (https://core.telegram.org/bots/api) และเงื่อนไขของ Jitsi สาธารณะ (การฝัง, การล็อกอินผู้ดูแล) เปลี่ยนได้ ให้ตรวจเอกสารปัจจุบันก่อนลงมือทำ M4 และ M5