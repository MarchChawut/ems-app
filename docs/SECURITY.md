# Security — EMS TRD DTC

เอกสารนี้สรุปแบบจำลองภัยคุกคาม มาตรการที่มีในระบบ รายการตั้งค่า environment ที่บังคับ และขั้นตอนที่ต้องทำเองเมื่อมีเหตุการณ์
(ผลการตรวจ pentest/security รอบล่าสุด: 2026-11-09)

## 1. ข้อมูลที่ต้องปกป้อง
- ข้อมูลบุคคล (ชื่อ ตำแหน่ง เบอร์โทร ที่อยู่ วันเกิด รูปโปรไฟล์ **ลายเซ็น**) — ลายเซ็นใช้ปลอมเอกสารได้
- ข้อมูลการลา/หนังสือเข้า-ออก/ครุภัณฑ์/พัสดุ
- ข้อมูลยืนยันตัวตน: รหัสผ่าน (bcrypt), TOTP secret (AES-GCM), passkey, session token

## 2. มาตรการหลัก (ตรวจโดยเทสต์ใน `src/app/api/security.test.ts`, `src/proxy.test.ts`)
| หัวข้อ | มาตรการ |
|---|---|
| Session | cookie `httpOnly + SameSite=Strict + secure(prod)`; DB เก็บเฉพาะ SHA-256 ของ token; token ไม่เคยอยู่ใน JSON; เปลี่ยนรหัสผ่าน/รีเซ็ต 2FA/รีเซ็ตรหัสผ่าน → ตัด session |
| ข้อมูลที่ส่งไป browser | `SessionUser` สร้างจาก allow-list (`toSessionUser`) — ห้าม spread แถว `User` (เคยรั่ว `twoFactorSecret` ไปทุกหน้า) |
| CSRF | proxy ตรวจ `Origin` / `Sec-Fetch-Site` ของทุกคำขอที่เปลี่ยนข้อมูลไป `/api/*` (same-origin หรืออยู่ใน `ALLOWED_ORIGINS`) + SameSite=Strict |
| บัญชีที่แอดมินตั้งรหัสให้ | ต้องเปลี่ยนรหัสผ่านเอง + ลงทะเบียน passkey (ถ้าระบบรองรับ) ก่อนใช้งาน — บังคับที่ `requireAuth` (403 `SETUP_REQUIRED`) ไม่ใช่แค่ UI; รหัสเริ่มต้นหมดอายุใน 7 วัน |
| สิทธิ์ผู้ดูแล | ADMIN จัดการเฉพาะบัญชีที่ไม่ใช่ ADMIN/SUPER_ADMIN, ตั้ง role ADMIN/SUPER_ADMIN ไม่ได้, เปลี่ยน role ตัวเองไม่ได้ (`src/lib/user-policy.ts`) |
| ไฟล์ | เก็บใน DB (`UploadedFile`) เปิดผ่าน `/api/files/[id]` ที่ต้องล็อกอิน; ไฟล์ลายเซ็นจำกัดเฉพาะเจ้าของ/MANAGER+/HR/หัวหน้าโดยตรง; ตรวจชนิดไฟล์จาก magic bytes; `/uploads/*` ถูกปิด |
| บอร์ดงาน | ส่วนรวม: ทุกคนเห็น แก้ไขได้เฉพาะ ADMIN/SUPER_ADMIN; ส่วนตัว: เห็น/แก้ไขได้เฉพาะเจ้าของ (ไม่แสดงในแดชบอร์ด ไม่ส่ง LINE) |
| Export | กัน formula injection ใน XLSX/CSV (`src/lib/excel-safe.ts`) |
| Login | ข้อความเดียวกันทุกกรณีล้มเหลว (กัน enumeration), เทียบ hash เสมอ (กัน timing), rate limit ตาม IP และ username |
| Dependencies | `pnpm audit --prod --audit-level=high` ต้องไม่มี high/critical ก่อน deploy (ข้อยกเว้นที่ทราบ: `zod` 3.x DoS ต้องอัปเป็น v4, `uuid` ผ่าน `exceljs`) |

## 3. Environment ที่ต้องตั้ง (ไม่มี fallback ที่ปลอดภัยในโค้ด)
| ตัวแปร | หมายเหตุ |
|---|---|
| `DATABASE_URL` | ห้าม commit; DB ต้องไม่เปิดสู่เครือข่ายสาธารณะ |
| `TWO_FACTOR_ENC_KEY` | คีย์เข้ารหัส TOTP secret — รั่ว = 2FA ใช้ไม่ได้ ต้องหมุนและเข้ารหัสใหม่ |
| `CRON_SECRET` | ใช้กับ `/api/cron/reminders` และ worker |
| `LINE_CHANNEL_SECRET` | ตรวจลายเซ็น webhook |
| `ALLOWED_ORIGINS` | origin ข้ามเว็บที่อนุญาต (คั่น `,`); same-origin อนุญาตเสมอ |
| `TRUSTED_PROXY_HOPS` | จำนวน proxy ที่เชื่อถือหน้าแอป (ค่าเริ่มต้น 1) ใช้หา IP จริงจาก `X-Forwarded-For` (นับจากขวา) |
| `FORCE_HTTPS=true` | เปิด redirect HTTP→HTTPS (เปิดเมื่อมี HTTPS จริงเท่านั้น) |
| `RP_ID`, `WEBAUTHN_ORIGIN` | passkey ต้องเป็นโดเมนจริง + HTTPS (IP ใช้ไม่ได้); ถ้าใช้ไม่ได้ ระบบข้ามขั้นบังคับ passkey อัตโนมัติ (`ENFORCE_PASSKEY_SETUP=true` เพื่อบังคับ) |
| `SEED_ADMIN_PASSWORD` | ≥ 12 ตัวอักษร บังคับบน production; seed สร้าง **Super Admin เพียง 1 บัญชี** (พนักงานอื่นเพิ่มเองในระบบ) บังคับเปลี่ยนรหัสผ่านครั้งแรก และไม่พิมพ์รหัสผ่านที่มาจาก env |
| `TEST_ACCOUNT_PASSWORD` | ใช้กับ `scripts/reset-test-data.ts` (ฐานทดสอบเท่านั้น) — ไม่ตั้ง = สุ่มให้ทุกครั้ง ไม่มีรหัสผ่านทดสอบฝังในโค้ด |
| `DB_ROOT_PASSWORD`, `DB_PASSWORD`, `DB_BIND_ADDRESS` | ใช้กับ `docker-compose.yml` (ไม่มีค่าเริ่มต้น; bind `127.0.0.1` เป็นค่าเริ่มต้น) |

## 4. ลำดับ deploy ที่ปลอดภัย
1. `pnpm install` → `pnpm exec prisma generate` → **`pnpm exec prisma migrate deploy`** (มี migration ที่เพิ่มคอลัมน์ใน `users`: ถ้ารัน code ใหม่ก่อน migrate ทุกคำสั่งที่อ่านตาราง `users` รวมถึงล็อกอินจะล้ม — `systemd/deploy.sh` ทำตามลำดับนี้อยู่แล้ว)
2. `pnpm exec tsx scripts/migrate-uploads-to-db.ts` (ย้ายรูปโปรไฟล์/เอกสารจาก `public/uploads` เข้า DB) แล้วลบโฟลเดอร์ `public/uploads`
3. `pnpm audit --prod --audit-level=high`, `pnpm build`
4. หลัง deploy ผู้ใช้ทุกคนต้องล็อกอินใหม่ (session token เปลี่ยนเป็นแบบ hash)

## 5. เหตุการณ์ที่ต้องทำเอง (code แก้ให้ไม่ได้)
- **ไฟล์ใน `public/uploads/` เคยถูกเสิร์ฟสาธารณะและอยู่ใน git history** (`profiles/profile_29_*.jpg`, `form/S__3293191.jpg`): ถือว่าเปิดเผยแล้ว; ล้างออกจาก history ด้วย `git filter-repo --path public/uploads --invert-paths` แล้ว force-push (ประสานทีมก่อน)
- **รหัสผ่านเริ่มต้นเก่าที่เคยฝังใน repo** (admin / seed users / `password123` ของบัญชีนำเข้า): หมุนทุกบัญชีที่ยังใช้; ตรวจ `users` ที่ `mustChangePassword = true` ค้างนาน
- **หมุนความลับถ้า repo/ไฟล์ build (`dist-seed`) เคยออกนอกทีม**: `TWO_FACTOR_ENC_KEY` (ต้อง decrypt/encrypt TOTP secret ใหม่ หรือให้ทุกคนตั้ง 2FA ใหม่), `CRON_SECRET`, `LINE_CHANNEL_SECRET`, รหัสผ่าน DB
- ตั้งสิทธิ์ไฟล์ `.env` / `worker/.env.worker` เป็น `600`; `backups/` ต้องเข้าถึงได้เฉพาะเจ้าของระบบ

## 6. ข้อจำกัด/งานต่อ
- CSP ยังมี `'unsafe-inline'` สำหรับ script (Next.js inline bootstrap) — งานต่อ: nonce-based CSP ผ่าน proxy
- รหัสผ่านเริ่มต้นร่วม (`password123`) ของบัญชีนำเข้ายังเสี่ยงจนกว่าเจ้าของจะตั้งค่าครั้งแรก — บรรเทาด้วยอายุ 7 วัน, rate limit, และต้องผ่าน 2FA enrol; แนะนำให้ให้ผู้ใช้ตั้งค่าครั้งแรกทันทีที่นำเข้า
- `zod` 3.x มีรายงาน DoS จาก collection ขนาดใหญ่ (แก้ใน v4) — ทุก schema ในระบบจำกัดขนาด array แล้ว
