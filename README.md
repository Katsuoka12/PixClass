# Student Tag

เว็บเรียนออนไลน์ภาษาไทยสำหรับครู นักเรียน และผู้ดูแลระบบ แยก Nuxt frontend กับ Express REST API ออกจากกัน สื่อสารผ่าน HTTP เท่านั้น สัญญา API อยู่ที่ [docs/api.md](docs/api.md)

## สถานะ

**M1: โครงโปรเจกต์ + Auth** และ **M2: ห้องเรียน + ประกาศ** — สมัครนักเรียน, login/logout, ตรวจ session และสิทธิ์ทั้ง API/UI, ครูสร้าง/แก้ไข/เก็บห้อง, นักเรียนเข้าร่วมด้วยรหัส, ครูนำสมาชิกออก และโพสต์ประกาศบนสตรีม

หน้าแรกแสดงรายการห้องเรียนจริงและห้องที่เก็บแล้ว หน้าห้องมีสตรีม / งานในชั้นเรียน / บุคคล / คะแนน (ครู) ยังไม่เริ่ม M3–M6: ส่งงาน/ตรวจคะแนน, Telegram, Jitsi และ cron ส่วนงานและคะแนนระบุว่ารอขั้นถัดไป

สีตาม [พาเลตที่เลือก](https://colorhunt.co/palette/f3f6f47d8d395b6e2cff5a22): `#F3F6F4`, `#7D8D39`, `#5B6E2C`, `#FF5A22` ใช้ฟอนต์ **Anuphan (อนุพันธ์)** แบบ variable ที่เก็บในเว็บเอง รองรับไทย/อังกฤษ ไม่มีการส่งข้อมูลนักเรียนไปโหลดฟอนต์หรือ analytics ภายนอก

## สิ่งที่ต้องมี

- Node.js **24 LTS ตั้งแต่ 24.15.0 ขึ้นไป** และ npm ตรวจด้วย `node --version` ก่อนติดตั้ง (Node 20 ใช้ Nuxt รุ่นนี้ไม่ได้)
- MariaDB/MySQL จาก XAMPP ใช้เฉพาะ MySQL และ phpMyAdmin ไม่ใช้ Apache/PHP เป็นเซิร์ฟเวอร์แอป
- ใช้ Nuxt stable 4.6.4 ตอนเริ่ม M1; เก็บเวอร์ชันติดตั้งจริงไว้ใน lockfile ของแต่ละฝั่ง

## ติดตั้งและตั้งค่า

รันจากโฟลเดอร์โปรเจกต์:

```sh
# ติดตั้ง (แยกกัน)
cd backend && npm install
cd ../frontend && npm install
cd ..

# ตั้งค่า
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

PowerShell ใช้ `Copy-Item backend/.env.example backend/.env` และ `Copy-Item frontend/.env.example frontend/.env` ได้เช่นกัน

แก้ `backend/.env` ให้ตรงกับฐานข้อมูล ตั้ง `JWT_SECRET` ใหม่อย่างน้อย 32 ตัวอักษร ห้ามใช้ค่าตัวอย่าง สร้างได้ด้วย:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

เปิด MySQL ใน XAMPP สร้างฐานข้อมูล `student_tag` ด้วย charset `utf8mb4` / collation `utf8mb4_unicode_ci` แล้วเลือกฐานข้อมูลและ import **database/schema.sql ก่อน database/seed.sql** ผ่าน phpMyAdmin นำเข้าแต่ละครั้งบนฐานข้อมูลว่าง SQL ไม่มีคำสั่งลบตารางเดิม ไม่ควร import seed ซ้ำ

หรือใช้ mysql CLI (ปรับ path ตามเครื่อง):

```sql
CREATE DATABASE student_tag CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE student_tag;
SOURCE database/schema.sql;
SOURCE database/seed.sql;
```

รัน SQL จาก CLI ที่เปิดในโฟลเดอร์โปรเจกต์ ใช้ `mysql -u root -p` และพิมพ์รหัสผ่านตามที่ตั้งใน XAMPP

## รัน

เปิดสองเทอร์มินัลจากโฟลเดอร์โปรเจกต์:

```sh
cd backend && npm run dev     # API 127.0.0.1:4000
```

```sh
cd frontend && npm run dev    # Nuxt http://localhost:3000
```

หรือใช้สคริปต์ราก `npm run dev:backend` และ `npm run dev:frontend` เปิด [http://localhost:3000](http://localhost:3000) ด้วยชื่อ host นี้ให้ตรงกับ `WEB_URL` เบราว์เซอร์เรียก `/api/*` ผ่าน Nuxt proxy; ตอน SSR Nuxt ส่ง cookie ไปหา Express โดยตรงผ่าน private runtime config

## บัญชีตัวอย่าง

ทุกบัญชีใช้รหัสผ่าน **`StudyTag!2026`** เก็บใน seed เป็น bcrypt cost 12:

| บทบาท | อีเมล |
|---|---|
| admin | admin@student-tag.test |
| teacher | teacher@student-tag.test |
| student | student1@student-tag.test |
| student | student2@student-tag.test |
| student | student3@student-tag.test |
| student | student4@student-tag.test |

seed มีห้องวิทยาศาสตร์ 1 ห้อง สมาชิก 4 คน และงาน 2 งานเพื่อใช้ milestone ถัดไป การสมัครผ่านเว็บสร้างได้เฉพาะ student เท่านั้น

## ตรวจและทดสอบ

```sh
cd backend && npm run typecheck && npm run test
cd ../frontend && npm run typecheck
```

`npm test` รัน HTTP tests โดยจำลองเฉพาะขอบเขตฐานข้อมูล ใช้ Express, bcrypt, JWT, cookie และ middleware จริง Database integration tests จะข้ามถ้าไม่เปิด `RUN_DB_TESTS=1` วิธีรันกับ MariaDB จริงอยู่ใน [backend/README.md](backend/README.md)

```sh
cd backend && npm run build
cd ../frontend && npm run build
```

ยังไม่มี lint script ใช้ strict typecheck, tests และ build เป็น checks ผลตรวจจริงอยู่ใน [M1 verification](docs/m1-verification.md) และ [M2 verification](docs/m2-verification.md)

## ทดลองห้องเรียนและประกาศ (M2)

1. Login เป็นครู กด **สร้างห้องเรียน** ใส่ชื่อ/ชั้นเรียน แล้วจดรหัสที่ปรากฏในหน้าห้อง
2. เขียนข้อความที่ช่อง **ประกาศถึงนักเรียน** แล้วกด **โพสต์ประกาศ**
3. Logout แล้ว login นักเรียน กด **เข้าร่วมห้องเรียน** ใส่รหัสจากครู แล้วอ่านประกาศในสตรีม
4. ครูแก้ชื่อ/ชั้นเรียนได้ และนำสมาชิกออกได้ในแท็บ **บุคคล** สมาชิกที่ถูกนำออกจะเปิดห้อง/สตรีม/รายชื่อไม่ได้จนกว่าจะเข้าร่วมด้วยรหัสอีกครั้ง
5. **เก็บห้องเรียน** มีหน้ายืนยัน หลังเก็บแล้วสมาชิกเดิมอ่านข้อมูลได้ แต่เข้าร่วมใหม่ โพสต์ แก้ไข และนำสมาชิกออกไม่ได้ M2 ยังไม่มีการคืนห้องที่เก็บแล้ว

รหัสห้องใหม่สุ่มด้วย crypto 12 ตัวอักษร/ตัวเลข และไม่ซ้ำ มีการจำกัดการลองรหัส 20 ครั้ง/นาทีต่อ IP แสดงรหัสเฉพาะครูเจ้าของห้อง Admin ไม่มีสิทธิ์เข้าห้องของผู้อื่นโดยอัตโนมัติ รายชื่อสมาชิกแสดงชื่อโดยไม่เปิดเผยอีเมล สร้างห้องใหม่ไม่ต้อง import schema เพิ่มจาก M1

## ข้อสมมติและการใช้งานจริง

- Session อายุ 15 นาที ไม่มี refresh token; หมดอายุแล้วต้องเข้าสู่ระบบใหม่ Logout ลบ cookie ในเบราว์เซอร์ ส่วนสำเนา JWT ที่ถูกขโมยก่อน logout ยังมีอายุได้จนหมดเวลา การระงับบัญชีปฏิเสธได้ทันทีเพราะ API อ่านสถานะจาก DB ทุกคำขอ
- API รับ JSON เท่านั้น ข้อมูลเกิน 16 KB ถูกปฏิเสธ รหัสผ่าน 8 ตัวอักษรขึ้นไปและไม่เกิน 72 ไบต์ UTF-8 เพื่อไม่ให้ bcrypt ตัดรหัสผ่านเงียบ ๆ
- ทุก POST ต้องมี Origin ตรง `WEB_URL` (scheme + host + port ไม่มี `/` ปิดท้าย) และไม่ใช่ `Sec-Fetch-Site: cross-site` รวมถึง login/register/logout; curl/Postman ต้องใส่ Origin เช่นกัน
- API bind ที่ loopback เท่านั้น Trust forwarding headers เฉพาะ loopback proxy ตั้ง reverse proxy ในเครื่องให้ **เขียนทับ header จาก client** และส่ง IP จริง ก่อนใช้กับผู้ใช้หลายคน/production ห้ามเปิดพอร์ต API/3306 ออกอินเทอร์เน็ต
- Production ต้อง HTTPS, `NODE_ENV=production`, `WEB_URL=https://...`, secret ใหม่, DB user สิทธิ์เท่าที่จำเป็นและรหัสผ่านจริง ห้ามใช้บัญชี seed และต้องตั้งรหัส MySQL root
- Nuxt `devProxy` ใช้เฉพาะตอน dev; production ต้อง reverse proxy `/api/*` ไป Express เอง ตั้ง `NUXT_API_SERVER_BASE=http://127.0.0.1:4000/api` ให้ SSR ด้วยเมื่อเปลี่ยนที่อยู่ API และไม่ cache HTML ที่มี session
- Rate limit เป็น memory ของ API process: login/register แยกกันอย่างละ 10 ครั้ง/15 นาทีต่อ IP รีสตาร์ตแล้วเริ่มใหม่ เหมาะกับ API instance เดียว
- Telegram/Jitsi ยังไม่ทำใน M1 เมื่อลงมือ M4/M5 จะตรวจเอกสารปัจจุบันก่อนตาม AGENTS.md สำหรับทดสอบปุ่ม Telegram ใช้ tunnel HTTPS (เช่น `cloudflared tunnel --url http://localhost:3000` หรือ `ngrok http 3000`) แล้วตั้ง `WEB_URL` เป็น public origin และเปิดเว็บผ่าน URL เดียวกัน บอท polling ไม่ต้องมี webhook public URL; ปุ่ม Telegram ใช้ localhost ไม่ได้
- npm audit ของ frontend มี transitive advisories 10 รายการ (6 low / 4 moderate) ใน Nuxt/Nitro dependency chain ณ วันที่ทดสอบ ไม่มี high/critical แต่ยังต้องติดตาม upstream ก่อน deploy; ไม่ใช้ `audit fix --force` ซึ่งเสนอ downgrade Nuxt ขัดกับสเปก stable ล่าสุด
