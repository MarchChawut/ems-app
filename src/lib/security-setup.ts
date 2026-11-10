/**
 * ==================================================
 * Security Setup - การตั้งค่าความปลอดภัยครั้งแรกของบัญชีที่ผู้ดูแลระบบตั้งรหัสผ่านให้
 * ==================================================
 * บัญชีที่รหัสผ่านถูกตั้งโดยคนอื่น (นำเข้าจากไฟล์ / สร้างโดยแอดมิน / แอดมินรีเซ็ตรหัสผ่าน) ต้อง:
 *   1) เปลี่ยนรหัสผ่านเองก่อนใช้งานส่วนอื่น (mustChangePassword)
 *   2) ลงทะเบียน passkey อย่างน้อย 1 อัน (forcePasskeySetup) — 2FA (TOTP) บังคับตอนล็อกอินอยู่แล้วทุกบัญชี
 *   3) ทำให้เสร็จภายในอายุของรหัสผ่านเริ่มต้น (initialPasswordExpiresAt) ไม่เช่นนั้นล็อกอินไม่ได้จนกว่าแอดมินจะรีเซ็ตใหม่
 * ระหว่างที่ยังไม่เสร็จ requireAuth จะปฏิเสธทุก API ยกเว้นรายการใน SETUP_ALLOWED_API_PREFIXES
 *
 * ไม่ import Prisma — ใช้ได้ทั้ง server และ unit test
 */

import { isCanonicalPath } from './path-normalize';

/** อายุรหัสผ่านเริ่มต้น (วัน) — หลังจากนี้ต้องให้แอดมินรีเซ็ตใหม่ */
export const INITIAL_PASSWORD_VALID_DAYS = 7;

/**
 * API ที่ใช้ได้ระหว่างตั้งค่าครั้งแรก (นอกนั้นตอบ 403 SETUP_REQUIRED)
 * ต้องเข้าถึงได้: ตรวจ session, ออกจากระบบ, เปลี่ยนรหัสผ่าน, ลงทะเบียน/ดู passkey, จัดการ 2FA ของตัวเอง, ข้อมูลตัวเอง
 */
export const SETUP_ALLOWED_API_PREFIXES = [
  '/api/auth/session',
  '/api/auth/logout',
  '/api/auth/change-password',
  '/api/auth/setup-status',
  '/api/auth/passkey/register/',
  '/api/users/me',
] as const;

/**
 * exact path ที่ใช้ได้: GET รายการ passkey ของตัวเอง + endpoint 2FA "ของตัวเอง" แต่ละตัว
 * (ห้ามใช้ prefix /api/auth/2fa — จะครอบ DELETE /api/auth/2fa/[userId] ที่แอดมินใช้รีเซ็ต 2FA ของ "คนอื่น"
 *  ทำให้บัญชีแอดมินที่ยังตั้งค่าไม่เสร็จ (รหัสผ่านเริ่มต้นรั่วได้) ลบ 2FA/session ของผู้ใช้อื่นได้)
 */
const SETUP_ALLOWED_API_EXACT = [
  '/api/auth/passkey',
  '/api/auth/2fa',
  '/api/auth/2fa/setup',
  '/api/auth/2fa/enable',
  '/api/auth/2fa/verify',
  '/api/auth/2fa/backup-codes/regenerate',
] as const;

export function isSetupAllowedPath(rawPathname: string): boolean {
  // allow-list: ผ่านได้เฉพาะ path ที่ "สะอาด" และตรงเป๊ะ — path ที่มี encoding / slash ซ้อน / dot-segment (/api/users/me/../1)
  // ถูกปฏิเสธทั้งหมด ไม่พยายามแปลงแล้วปล่อยผ่าน (ไม่งั้นรูปแบบแปลกๆ อาจหลุดไป API อื่นระหว่างที่ยังตั้งค่าความปลอดภัยไม่เสร็จ)
  if (!isCanonicalPath(rawPathname)) return false;
  const pathname = rawPathname.length > 1 && rawPathname.endsWith('/') ? rawPathname.slice(0, -1) : rawPathname;
  if ((SETUP_ALLOWED_API_EXACT as readonly string[]).includes(pathname)) return true;
  return SETUP_ALLOWED_API_PREFIXES.some((p) => (p.endsWith('/') ? pathname.startsWith(p) : pathname === p || pathname.startsWith(`${p}/`)));
}

/**
 * ระบบนี้ใช้ passkey ได้จริงหรือไม่: WebAuthn ต้องการ RP ID เป็นโดเมน (ไม่ใช่ IP) และ origin เป็น HTTPS (localhost ยกเว้น)
 * ถ้าใช้ไม่ได้ (เช่น เปิดผ่าน http://192.168.x.x บน NAS) แล้วยังบังคับ passkey = ผู้ใช้ติดค้างตั้งค่าไม่เสร็จ → ข้ามขั้นนี้อัตโนมัติ
 * เว้นแต่ตั้ง ENFORCE_PASSKEY_SETUP=true เพื่อบังคับเสมอ
 */
export function isPasskeyEnforceable(env: Record<string, string | undefined> = process.env): boolean {
  if (env.ENFORCE_PASSKEY_SETUP === 'true') return true;
  const rpId = env.RP_ID || 'localhost';
  const origin = env.WEBAUTHN_ORIGIN || 'http://localhost:3000';
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(rpId) || rpId.includes(':')) return false; // IP address ใช้เป็น RP ID ไม่ได้
  return rpId === 'localhost' || origin.startsWith('https://');
}

/** ค่าที่ต้องบันทึกลง User เมื่อรหัสผ่านถูกตั้งโดยคนอื่น (นำเข้า/แอดมินสร้าง/แอดมินรีเซ็ต) */
export function initialSetupFlags(opts: { hasPasskey?: boolean; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  return {
    mustChangePassword: true,
    forcePasskeySetup: isPasskeyEnforceable() && !opts.hasPasskey,
    initialPasswordExpiresAt: new Date(now.getTime() + INITIAL_PASSWORD_VALID_DAYS * 24 * 60 * 60 * 1000),
  };
}

/** รหัสผ่านเริ่มต้นหมดอายุแล้วหรือยัง (ใช้ตอนล็อกอิน; ผู้ที่เปลี่ยนรหัสผ่านแล้วไม่มีวันหมดอายุ) */
export function isInitialPasswordExpired(
  user: { mustChangePassword: boolean; initialPasswordExpiresAt: Date | null },
  now: Date = new Date()
): boolean {
  return user.mustChangePassword && !!user.initialPasswordExpiresAt && now > user.initialPasswordExpiresAt;
}
