# Student Tag API — M3

Express 5 + strict TypeScript + zod 4 + mysql2/promise SQL ตรง ใช้ Node 24 LTS >=24.15.0 ติดตั้งและรันจากโฟลเดอร์นี้:

```sh
npm install
cp .env.example .env
# แก้ JWT_SECRET, WEB_URL และ DB_* แล้ว import ../database/schema.sql และ seed.sql
npm run dev
npm run typecheck
npm test
npm run build
npm start
```

API พอร์ต 4000 bind `127.0.0.1` เริ่มได้เมื่อต่อ DB ได้สำเร็จ ฟังเฉพาะ loopback ให้ Nuxt/reverse proxy เรียก Auth token อยู่ใน HttpOnly cookie อายุ 15 นาที `SameSite=Lax`, `Secure` เมื่อ WEB_URL เป็น HTTPS ต้องเปิด HTTPS ใน production

สัญญา request/response/errors อยู่ที่ [../docs/api.md](../docs/api.md) ใช้ role guard ใน API โดยไม่เชื่อ role จาก frontend หรือ JWT, อ่านผู้ใช้และสถานะจาก DB ทุกครั้ง ทดสอบ endpoint ด้วย client ภายนอกต้องตั้ง `Origin` ให้ตรง WEB_URL ทุก POST

อีเมล seed: `admin@student-tag.test`, `teacher@student-tag.test`, `student1@student-tag.test` ถึง `student4@student-tag.test` รหัสผ่านทุกบัญชี `StudyTag!2026` ใช้เฉพาะ dev

## ทดสอบฐานข้อมูลจริง

สร้างฐานข้อมูลว่าง **student_tag_m1_test** ใน MariaDB แล้ว import schema.sql และ seed.sql เข้า DB นี้โดยเฉพาะ Tests จะปฏิเสธชื่อ DB อื่นเพื่อไม่แตะข้อมูลใช้งานจริง ใช้ API test config นี้ใน PowerShell (ตั้ง DB_HOST/DB_USER/DB_PASS ตามเครื่อง):

```powershell
$env:RUN_DB_TESTS='1'
$env:DB_NAME='student_tag_m1_test'
$env:DB_PORT='3306'
$env:JWT_SECRET='integration-test-only-secret-with-at-least-32-characters'
$env:WEB_URL='http://localhost:3000'
$env:NODE_ENV='test'
npm test
```

Tests login seed ทั้ง 3 role, ตรวจการปฏิเสธ role อื่น, สมัคร/ตรวจรหัสผ่านที่เก็บจริง, email ซ้ำ, ระงับ session, UTF-8 และ foreign key รวมถึง M2 สร้างห้อง/join พร้อมกัน/ประกาศ/เจ้าของห้อง/นำสมาชิกออก/เก็บห้อง SQL tests ลบเฉพาะห้อง ประกาศ สมาชิก และบัญชี test ที่สร้างเอง ไม่มี drop/schema reset อัตโนมัติ ไม่แก้ไขห้อง seed ต้องไม่เปิดแอปที่เขียนข้อมูลร่วม DB นี้ระหว่างทดสอบ ปิด terminal test หลังใช้เพื่อไม่ให้ environment override `.env`

Unit/HTTP suite ใช้ store จำลองใน tests เท่านั้น ไม่มี fallback แบบ in-memory ในแอปจริง M3 repository/HTTP/upload suites ใช้ MariaDB จริงและไฟล์ชั่วคราว ลบเฉพาะ fixtures ของตัวเองหลังทดสอบ เปิด RUN_DB_TESTS และใช้ชื่อฐานข้อมูลตามด้านบนเช่นเดิม `npm run test:db` ครอบคลุม DB suites ทั้งหมดเมื่อเปิดตัวแปรแล้ว

M2 เพิ่ม `class-db.ts` (prepared SQL), `classrooms.ts` (repository types), `routes/classes.ts` (validation/authorization) และ HTTP/DB tests ไม่ต้องเปลี่ยน schema ทุก mutation ตรวจ archived ใน SQL อีกชั้นเพื่อป้องกันการแก้ห้องหลังถูกเก็บ Timestamp ใหม่ใช้ UTC_TIMESTAMP() แล้วตอบ ISO UTC

M3 เพิ่ม `assignment-db.ts`, `assignments.ts`, `routes/assignments.ts` และ `uploads.ts` ไม่ต้อง migrate schema จาก M1/M2 ใช้ transaction ล็อก class → assignment → submission เพื่อ serialize การตรวจและแก้ส่ง รวมถึงปรับ removeMember ให้ใช้ลำดับล็อกเดียวกัน เกรด 0 ถูกนับว่าตรวจแล้ว มี SQL tests สำหรับ archive/removal/grade/submit ที่ชนกัน

Uploads ใช้ Multer 2.5.0 + file-type 22.3.0, disk storage ไม่เกิน 10 MB/ไฟล์, PDF/JPEG/PNG/DOCX, ชื่อสุ่ม 64 hex chars เก็บใน `uploads/` ใกล้โฟลเดอร์ backend ไม่ขึ้นกับ cwd ไม่มี static serve ดาวน์โหลดผ่าน `/api/submissions/:id/file` เท่านั้น ครูเจ้าของห้องหรือเจ้าของงานที่ยังเป็นสมาชิกจึงดาวน์โหลดได้ ไม่คืน file_path ใน JSON ทำ backup uploads คู่กับ DB และกำหนด reverse proxy ให้รับไฟล์ 10 MB พร้อม timeout ที่พอเหมาะ (frontend multipart 120 วินาที)

ชนิดไฟล์ตรวจจาก signature และเทียบกับนามสกุล ไม่ใช่ malware scan ไม่ส่งข้อมูลออกบริการอื่น หลัง DB บันทึกสำเร็จจึงลบไฟล์เก่าที่ถูกแทน/ลบ หาก disk cleanup ผิดพลาดจะ log ข้อความทั่วไปและเก็บผล DB ไว้ ผู้ดูแลควรตรวจพื้นที่เก็บและไฟล์ orphan หลังเหตุขัดข้อง

ยังไม่มี Telegram bot/cron ใน M3 ค่าที่เตรียมไว้ใน `.env.example` ยังไม่เริ่มใช้ เช็กรายละเอียด production และ proxy ใน README ราก
