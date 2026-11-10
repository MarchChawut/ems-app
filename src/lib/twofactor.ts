/**
 * ==================================================
 * Two-Factor (TOTP) Helpers - เครื่องมือสำหรับ 2FA
 * ==================================================
 * รวม TOTP (otplib v13 functional API), การจัดการรหัสสำรอง (backup codes)
 * และ challenge ชั่วคราว "รอยืนยัน 2FA" ระหว่าง login (mirror รูปแบบของ webauthn.ts)
 */

import { randomBytes } from 'crypto';
import { cookies } from 'next/headers';
import { generateSecret, generateURI, verify as verifyOtp } from 'otplib';
import { prisma } from './prisma';
import { hashPassword, verifyPassword } from './security';

// ============================================
// TOTP
// ============================================

/** issuer ที่จะแสดงในแอป authenticator */
function getIssuer(): string {
  return process.env.RP_NAME || 'EMS TRD DTC';
}

/** สร้าง TOTP secret ใหม่ (base32) */
export function generateTotpSecret(): string {
  return generateSecret();
}

/** สร้าง otpauth:// URI สำหรับทำ QR code */
export function buildOtpAuthUri(username: string, secret: string): string {
  return generateURI({ issuer: getIssuer(), label: username, secret });
}

/**
 * ตรวจสอบรหัส TOTP ที่ผู้ใช้กรอก
 * @param secret - TOTP secret (ถอดรหัสแล้ว, base32)
 * @param token - รหัส 6 หลักที่ผู้ใช้กรอก
 * อนุญาตคลาดเคลื่อน ±1 ช่วงเวลา (epochTolerance 30 วินาที) กันนาฬิกาเหลื่อม
 */
export async function verifyTotp(secret: string, token: string): Promise<boolean> {
  const cleaned = token.replace(/\s/g, '');
  try {
    const result = await verifyOtp({ secret, token: cleaned, epochTolerance: 30 });
    return result.valid;
  } catch {
    // otplib throws (instead of returning invalid) for malformed input, e.g. a
    // backup code ("XXXXX-XXXXX") pasted into the TOTP field — callers try this
    // first and fall back to backup-code matching, so this must not throw.
    return false;
  }
}

// ============================================
// Backup codes
// ============================================

const BACKUP_CODE_COUNT = 10;

/** ตัดอักขระที่ไม่ใช่ตัวอักษร/ตัวเลขออก และแปลงเป็นตัวพิมพ์เล็ก เพื่อเทียบให้ตรงกัน */
export function normalizeBackupCode(code: string): string {
  return code.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

/**
 * สร้างรหัสสำรองชุดใหม่ พร้อม hash สำหรับเก็บลงฐานข้อมูล
 * @returns {plain, hashes} plain = แสดงให้ผู้ใช้ครั้งเดียว, hashes = เก็บลง DB
 */
export async function generateBackupCodes(
  count: number = BACKUP_CODE_COUNT
): Promise<{ plain: string[]; hashes: string[] }> {
  const plain: string[] = [];
  for (let i = 0; i < count; i++) {
    const hex = randomBytes(5).toString('hex').toUpperCase(); // 10 ตัวอักษร
    plain.push(`${hex.slice(0, 5)}-${hex.slice(5)}`); // รูปแบบ XXXXX-XXXXX
  }
  const hashes = await Promise.all(plain.map((c) => hashPassword(normalizeBackupCode(c))));
  return { plain, hashes };
}

/**
 * หา backup code ที่ตรงกับที่ผู้ใช้กรอก จากรายการรหัสที่ยังไม่ถูกใช้
 * @returns id ของ backup code ที่ตรง หรือ null หากไม่ตรง
 */
export async function findMatchingBackupCode(
  input: string,
  codes: { id: number; codeHash: string }[]
): Promise<number | null> {
  const normalized = normalizeBackupCode(input);
  for (const code of codes) {
    if (await verifyPassword(normalized, code.codeHash)) {
      return code.id;
    }
  }
  return null;
}

// ============================================
// Challenge "รอยืนยัน 2FA" ระหว่าง login
// ============================================

const PENDING_COOKIE = '2fa_pending';
const CHALLENGE_TTL_MS = 10 * 60 * 1000; // 10 นาที
export const MAX_2FA_ATTEMPTS = 5;

/**
 * สร้าง challenge รอยืนยัน 2FA และตั้ง cookie ชั่วคราวอ้างอิงถึง challenge นั้น
 * @param userId - ผู้ใช้ที่ผ่านการตรวจรหัสผ่านแล้ว
 * @param pendingSecret - (เฉพาะตอน enroll) TOTP secret ที่เข้ารหัสแล้ว กำลังรอยืนยัน
 */
export async function createPendingChallenge(
  userId: number,
  pendingSecret?: string
): Promise<void> {
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
  const record = await prisma.twoFactorChallenge.create({
    data: { userId, pendingSecret, expiresAt },
  });

  (await cookies()).set(PENDING_COOKIE, record.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: CHALLENGE_TTL_MS / 1000,
  });
}

/**
 * อ่าน challenge ปัจจุบันจาก cookie (ไม่ลบ เพื่อให้กรอกรหัสผิดแล้วลองใหม่ได้)
 * @returns challenge row หรือ null หากไม่พบ/หมดอายุ
 */
export async function getPendingChallenge() {
  const id = (await cookies()).get(PENDING_COOKIE)?.value;
  if (!id) return null;

  const record = await prisma.twoFactorChallenge.findUnique({ where: { id } });
  if (!record) return null;
  if (new Date() > record.expiresAt) return null;

  return record;
}

/** เพิ่มตัวนับการกรอกผิด คืนค่าจำนวนครั้งล่าสุด */
export async function bumpChallengeAttempts(id: string): Promise<number> {
  const updated = await prisma.twoFactorChallenge.update({
    where: { id },
    data: { attempts: { increment: 1 } },
    select: { attempts: true },
  });
  return updated.attempts;
}

/** จบ challenge: ลบ row + เคลียร์ cookie (เรียกเมื่อยืนยันสำเร็จหรือยกเลิก) */
export async function finishChallenge(id: string): Promise<void> {
  await prisma.twoFactorChallenge.delete({ where: { id } }).catch(() => undefined);
  (await cookies()).delete(PENDING_COOKIE);
}
