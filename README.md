# Student Tag

เว็บเรียนออนไลน์ภาษาไทยสำหรับครู นักเรียน และผู้ดูแลระบบ แยก Nuxt frontend กับ Express REST API ออกจากกัน สื่อสารผ่าน HTTP เท่านั้น สัญญา API อยู่ที่ [docs/api.md](docs/api.md)

## สถานะ

พัฒนาถึง **M4: เชื่อม Telegram** — รวม Auth, ห้องเรียน/ประกาศ, งาน/ส่งงาน/คะแนน, Gradebook, งานของฉัน, โปรไฟล์ผูก Telegram, แจ้งงาน/ประกาศ/คะแนนและเตือนคนค้างส่ง รองรับ polling และ webhook การส่งผ่าน Telegram จริงยังรอ Bot credentials ของผู้ใช้

หน้าห้องมีสตรีม / งานในชั้นเรียน / บุคคล / คะแนน (ครู) นักเรียนเปิด “งานของฉัน” จากแถบบนได้ ทุก role เปิดโปรไฟล์ได้ ยังไม่เริ่ม M5–M6: Jitsi, cron และจัดการผู้ใช้แบบ Admin

สีตาม [พาเลตที่เลือก](https://colorhunt.co/palette/f3f6f47d8d395b6e2cff5a22): `#F3F6F4`, `#7D8D39`, `#5B6E2C`, `#FF5A22` ใช้ฟอนต์ **Anuphan (อนุพันธ์)** แบบ variable ที่เก็บในเว็บเอง รองรับไทย/อังกฤษ ไม่มีการส่งข้อมูลนักเรียนไปโหลดฟอนต์หรือ analytics ภายนอก

## สิ่งที่ต้องมี

- Node.js **24 LTS ตั้งแต่ 24.15.0 ขึ้นไป** และ npm ตรวจด้วย `node --version` ก่อนติดตั้ง (Node 20 ใช้ Nuxt รุ่นนี้ไม่ได้)
- ถ้าใช้ nvm ต้องติดตั้งและเลือก Node 24 เป็น active version ก่อนเรียก npm หากขึ้น “No active Node.js version” ให้ตั้งค่า nvm ของเครื่องก่อน
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

ยังไม่มี lint script ใช้ strict typecheck, tests และ build เป็น checks ผลตรวจจริงอยู่ใน [M1 verification](docs/m1-verification.md), [M2 verification](docs/m2-verification.md), [M3 verification](docs/m3-verification.md) และ [M4 verification](docs/m4-verification.md)

## ตั้งค่าและทดลอง Telegram (M4)

1. สร้างบอทกับ **@BotFather** ด้วย `/newbot` แล้วใส่ `TELEGRAM_BOT_TOKEN` และ `TELEGRAM_BOT_USERNAME` (ไม่ใส่ @) ใน `backend/.env` โดยตรง ห้ามส่ง token ลงแชตหรือ commit ไฟล์จริง ค่า username ต้องตรงกับบอทที่ token ใช้งาน
2. ตั้ง `TELEGRAM_MODE=polling` แล้ว restart API ใช้บอทเดียวต่อหนึ่ง process ถ้ายังไม่ตั้งทั้งสองค่า เว็บยังทำงานได้ แต่ปุ่มเชื่อม Telegram ปิดอยู่
3. Login นักเรียน → **โปรไฟล์** → **เชื่อมต่อ Telegram** → **เปิด Telegram เพื่อเชื่อมบัญชี** → กด Start ในแชตส่วนตัว กลับเว็บกด **ตรวจสอบสถานะ** ลิงก์อายุ 15 นาทีใช้ครั้งเดียว สร้างใหม่ยกเลิกลิงก์เดิม อย่าส่งลิงก์ให้ผู้อื่น
4. ครูสร้างงาน/โพสต์ประกาศ/ให้คะแนน นักเรียนที่เชื่อมและเปิดแจ้งเตือนจะได้รับข้อความ ครูเปิดหน้างานแล้วกด **เตือนคนที่ยังไม่ส่ง** ดูจำนวนสำเร็จ/ไม่เชื่อม/mute/ล้มเหลว/ข้าม
5. บอทรองรับ `/tasks`, `/grades`, `/classes`, `/mute`, `/unmute` เฉพาะแชตส่วนตัว บัญชีที่ถูกระงับใช้คำสั่งข้อมูลไม่ได้ การ mute หยุดเฉพาะแจ้งเตือนอัตโนมัติและข้อความเตือนจากครู

Polling รับคำสั่งได้โดยไม่ต้องมี URL สาธารณะ แต่ **ปุ่มเปิดเว็บในข้อความ Telegram ใช้ localhost ไม่ได้** เมื่อต้องทดสอบข้อความพร้อมปุ่ม ให้เปิด tunnel ที่พอร์ต Nuxt 3000 เช่น `ngrok http 3000` หรือ `cloudflared tunnel --url http://localhost:3000` นำ HTTPS origin ที่ได้มาใส่ `WEB_URL` (ไม่มี slash ปิดท้าย) restart backend และเปิดเว็บผ่าน origin นี้เพื่อให้ cookie/CSRF ตรงกัน Nuxt proxy `/api` ยังชี้ backend loopback 4000; ไม่เปิดพอร์ต MariaDB

Production/webhook: ตั้ง `TELEGRAM_MODE=webhook`, `WEB_URL=https://<your-domain>` และสุ่ม `TELEGRAM_WEBHOOK_SECRET` อย่างน้อย 32 ตัวอักษร เช่นคำสั่ง randomBytes ด้านบน Runtime ลงทะเบียน URL `WEB_URL/api/telegram/webhook` ให้อัตโนมัติ ต้องมี HTTPS reverse proxy ที่ส่ง `/api/*` ไป API และคง header `X-Telegram-Bot-Api-Secret-Token` ไว้ คำขอ webhook ไม่ใช้ cookie/Origin และตรวจ secret แยกจาก CSRF เปิดเผยเฉพาะเว็บ/API ผ่าน proxy; backend และ DB อยู่ loopback กลับมา polling ระบบลบ webhook เดิมโดยไม่ทิ้ง pending updates

ข้อจำกัด M4: แจ้งเตือนทำหลังบันทึกข้อมูล ไม่มี persistent queue/retry เมื่อ process ปิดอาจสูญเสียข้อความที่รอส่ง ครูส่งเตือนซ้ำได้หลัง 1 นาที ระบบบันทึก failed แล้วส่งคนอื่นต่อ ไม่มีการยกเลิกการผูก/ย้าย Telegram ไปบัญชีอื่นใน MVP หากต้องเปลี่ยนให้ผู้ดูแลตรวจและแก้ข้อมูลอย่างระมัดระวัง ยังไม่ได้ทดสอบส่งกับ Telegram จริงเพราะ environment นี้ไม่มี Bot credentials; automated flow ใช้ DB จริงและ transport จำลองโดยไม่ส่งข้อมูลนักเรียนออก

## ทดลองส่งงานและตรวจคะแนน (M3)

1. Login ครู เปิดห้อง → **งานในชั้นเรียน** → **สร้างงาน** ระบุชื่อ คำอธิบาย กำหนดส่ง คะแนนเต็ม และการรับงานช้า
2. Login นักเรียน เปิดงานผ่านห้องหรือ **งานของฉัน** ส่งข้อความ และ/หรือไฟล์ PDF/JPG/PNG/DOCX ไม่เกิน 10 MB
3. ก่อนครูตรวจ นักเรียนแก้คำตอบได้ ไฟล์เดิมคงอยู่ถ้าไม่เลือกไฟล์ใหม่ และมีตัวเลือกให้ลบไฟล์เดิม
4. Login ครู เปิดงาน ดูรายชื่อ **ส่งแล้ว/ยังไม่ส่ง/ส่งช้า** ดาวน์โหลดไฟล์และให้คะแนนพร้อมคอมเมนต์ เปิดแท็บ **คะแนน** เพื่อดูตารางนักเรียน × งาน
5. Login นักเรียน อ่านคะแนนและคอมเมนต์ได้ที่งานเดิม หลังตรวจแล้วจะแก้คำตอบไม่ได้ รวมถึงกรณีได้ 0 คะแนน

คะแนนเต็ม 1–9999 คะแนน; ให้คะแนนได้ 0 ถึงคะแนนเต็ม ทศนิยมไม่เกิน 2 ตำแหน่ง ครูแก้คะแนนภายหลังได้แต่ไม่มีการยกเลิกสถานะตรวจแล้ว ถ้าไม่รับงานช้า จะส่ง/แก้หลังหมดเขตไม่ได้ ห้องที่เก็บแล้วอ่านงาน/คะแนนเดิมได้แต่เขียนไม่ได้ การลบงานลบการส่ง คะแนน และไฟล์ที่เกี่ยวข้องด้วย จึงมีหน้ายืนยันก่อนลบ

ไฟล์เก็บที่ `backend/uploads/` แบบส่วนตัว ใช้ชื่อสุ่มและตรวจ MIME จากเนื้อไฟล์ ดาวน์โหลดผ่าน API ที่ตรวจสิทธิ์ทุกครั้ง ไม่เปิด static URL ต้องสำรองไฟล์ควบคู่ฐานข้อมูล ตัวตรวจชนิดไฟล์ไม่ใช่ antivirus และระบบไม่ส่งไฟล์ไปสแกนภายนอก

## ทดลองห้องเรียนและประกาศ (M2)

1. Login เป็นครู กด **สร้างห้องเรียน** ใส่ชื่อ/ชั้นเรียน แล้วจดรหัสที่ปรากฏในหน้าห้อง
2. เขียนข้อความที่ช่อง **ประกาศถึงนักเรียน** แล้วกด **โพสต์ประกาศ**
3. Logout แล้ว login นักเรียน กด **เข้าร่วมห้องเรียน** ใส่รหัสจากครู แล้วอ่านประกาศในสตรีม
4. ครูแก้ชื่อ/ชั้นเรียนได้ และนำสมาชิกออกได้ในแท็บ **บุคคล** สมาชิกที่ถูกนำออกจะเปิดห้อง/สตรีม/รายชื่อไม่ได้จนกว่าจะเข้าร่วมด้วยรหัสอีกครั้ง
5. **เก็บห้องเรียน** มีหน้ายืนยัน หลังเก็บแล้วสมาชิกเดิมอ่านข้อมูลได้ แต่เข้าร่วมใหม่ โพสต์ แก้ไข และนำสมาชิกออกไม่ได้ M2 ยังไม่มีการคืนห้องที่เก็บแล้ว

รหัสห้องใหม่สุ่มด้วย crypto 12 ตัวอักษร/ตัวเลข และไม่ซ้ำ มีการจำกัดการลองรหัส 20 ครั้ง/นาทีต่อ IP แสดงรหัสเฉพาะครูเจ้าของห้อง Admin ไม่มีสิทธิ์เข้าห้องของผู้อื่นโดยอัตโนมัติ รายชื่อสมาชิกแสดงชื่อโดยไม่เปิดเผยอีเมล สร้างห้องใหม่ไม่ต้อง import schema เพิ่มจาก M1

## ข้อสมมติและการใช้งานจริง

- Session อายุ 15 นาที ไม่มี refresh token; หมดอายุแล้วต้องเข้าสู่ระบบใหม่ Logout ลบ cookie ในเบราว์เซอร์ ส่วนสำเนา JWT ที่ถูกขโมยก่อน logout ยังมีอายุได้จนหมดเวลา การระงับบัญชีปฏิเสธได้ทันทีเพราะ API อ่านสถานะจาก DB ทุกคำขอ
- API JSON จำกัด 16 KB ยกเว้น Telegram webhook 256 KB; ส่งงานรองรับ multipart ตาม M3 รหัสผ่าน 8 ตัวอักษรขึ้นไปและไม่เกิน 72 ไบต์ UTF-8 เพื่อไม่ให้ bcrypt ตัดรหัสผ่านเงียบ ๆ
- ทุก browser mutation ต้องมี Origin ตรง `WEB_URL` (scheme + host + port ไม่มี `/` ปิดท้าย) และไม่ใช่ `Sec-Fetch-Site: cross-site` รวมถึง login/register/logout; curl/Postman ต้องใส่ Origin เช่นกัน ยกเว้น Telegram webhook ที่ตรวจ secret ของตัวเอง
- API bind ที่ loopback เท่านั้น Trust forwarding headers เฉพาะ loopback proxy ตั้ง reverse proxy ในเครื่องให้ **เขียนทับ header จาก client** และส่ง IP จริง ก่อนใช้กับผู้ใช้หลายคน/production ห้ามเปิดพอร์ต API/3306 ออกอินเทอร์เน็ต
- Production ต้อง HTTPS, `NODE_ENV=production`, `WEB_URL=https://...`, secret ใหม่, DB user สิทธิ์เท่าที่จำเป็นและรหัสผ่านจริง ห้ามใช้บัญชี seed และต้องตั้งรหัส MySQL root
- Nuxt `devProxy` ใช้เฉพาะตอน dev; production ต้อง reverse proxy `/api/*` ไป Express เอง ตั้ง `NUXT_API_SERVER_BASE=http://127.0.0.1:4000/api` ให้ SSR ด้วยเมื่อเปลี่ยนที่อยู่ API และไม่ cache HTML ที่มี session
- Rate limit เป็น memory ของ API process: login/register แยกกันอย่างละ 10 ครั้ง/15 นาทีต่อ IP รีสตาร์ตแล้วเริ่มใหม่ เหมาะกับ API instance เดียว
- Jitsi จะทำใน M5 โดยตรวจเอกสารปัจจุบันก่อนตาม AGENTS.md การตั้งค่า Telegram และ tunnel สำหรับ M4 อยู่ในหัวข้อด้านบน
- npm audit ของ frontend มี transitive advisories 10 รายการ (6 low / 4 moderate) ใน Nuxt/Nitro dependency chain ณ วันที่ทดสอบ ไม่มี high/critical แต่ยังต้องติดตาม upstream ก่อน deploy; ไม่ใช้ `audit fix --force` ซึ่งเสนอ downgrade Nuxt ขัดกับสเปก stable ล่าสุด
