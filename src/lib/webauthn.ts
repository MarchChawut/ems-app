/**
 * ==================================================
 * WebAuthn / Passkey Helpers - เครื่องมือสำหรับ passkey
 * ==================================================
 * รวมการตั้งค่า Relying Party (RP), การแปลงข้อมูล public key
 * และการจัดการ challenge ชั่วคราวสำหรับ flow ลงทะเบียน/เข้าสู่ระบบ
 *
 * หมายเหตุ: WebAuthn ต้องการ secure context และ RP ID ที่เป็นโดเมนจริง
 * - dev: ใช้ http://localhost:3000 (localhost เป็น secure context และเป็น RP ID ที่ถูกต้อง)
 * - production: ต้องตั้ง RP_ID / WEBAUTHN_ORIGIN เป็นโดเมนจริงที่ให้บริการผ่าน HTTPS
 *   (เลข IP ล้วน เช่น 192.0.2.10 ใช้เป็น RP ID ไม่ได้ แม้จะเป็น HTTPS)
 */

import { cookies } from 'next/headers';
import { prisma } from './prisma';

// ============================================
// การตั้งค่า Relying Party (RP)
// ============================================

/**
 * ดึงการตั้งค่า RP จาก environment variables
 * @returns {object} rpID, rpName, origin
 */
export function getRpConfig() {
  return {
    rpID: process.env.RP_ID || 'localhost',
    rpName: process.env.RP_NAME || 'EMS TRD DTC',
    origin: process.env.WEBAUTHN_ORIGIN || 'http://localhost:3000',
  };
}

// ============================================
// การแปลงข้อมูล (base64url <-> Uint8Array)
// ============================================

/** แปลง Uint8Array เป็น base64url string สำหรับเก็บในฐานข้อมูล */
export function toBase64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

/** แปลง base64url string กลับเป็น Uint8Array (backed by ArrayBuffer ตามที่ simplewebauthn ต้องการ) */
export function fromBase64url(value: string): Uint8Array<ArrayBuffer> {
  const buf = Buffer.from(value, 'base64url');
  const bytes = new Uint8Array(buf.byteLength);
  bytes.set(buf);
  return bytes;
}

/** แปลง array ของ transports เป็น string สำหรับเก็บในฐานข้อมูล (คั่นด้วย comma) */
export function serializeTransports(transports?: string[] | null): string | null {
  if (!transports || transports.length === 0) return null;
  return transports.join(',');
}

/** แปลง string ที่เก็บไว้กลับเป็น array ของ transports */
export function parseTransports(value?: string | null): string[] | undefined {
  if (!value) return undefined;
  return value.split(',').filter(Boolean);
}

// ============================================
// การจัดการ challenge ชั่วคราว
// ============================================

const CHALLENGE_COOKIE = 'webauthn_challenge';
const CHALLENGE_TTL_MS = 5 * 60 * 1000; // challenge มีอายุ 5 นาที

/**
 * บันทึก challenge ลงฐานข้อมูลและตั้ง cookie ชั่วคราวอ้างอิงถึง challenge นั้น
 * @param challenge - ค่า challenge (base64url) จาก simplewebauthn
 * @param userId - ผู้ใช้ที่เกี่ยวข้อง (เจ้าของ session สำหรับลงทะเบียน, ผู้ใช้เป้าหมายสำหรับ login)
 */
export async function storeChallenge(challenge: string, userId?: number): Promise<void> {
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);

  const record = await prisma.webAuthnChallenge.create({
    data: { challenge, userId, expiresAt },
  });

  (await cookies()).set(CHALLENGE_COOKIE, record.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: CHALLENGE_TTL_MS / 1000,
  });
}

/**
 * อ่าน challenge จาก cookie + ฐานข้อมูล แล้วลบทิ้ง (ใช้ครั้งเดียว)
 * @returns {Promise<{challenge: string, userId: number | null} | null>} null หากไม่พบหรือหมดอายุ
 */
export async function consumeChallenge(): Promise<{ challenge: string; userId: number | null } | null> {
  const cookieStore = await cookies();
  const id = cookieStore.get(CHALLENGE_COOKIE)?.value;

  // ลบ cookie เสมอเพื่อกัน challenge ค้าง
  cookieStore.delete(CHALLENGE_COOKIE);

  if (!id) return null;

  const record = await prisma.webAuthnChallenge.findUnique({ where: { id } });

  if (!record) return null;

  // ลบ challenge ทิ้งทันที (ใช้ครั้งเดียวเท่านั้น)
  await prisma.webAuthnChallenge.delete({ where: { id } }).catch(() => undefined);

  // ตรวจสอบว่า challenge หมดอายุหรือยัง
  if (new Date() > record.expiresAt) return null;

  return { challenge: record.challenge, userId: record.userId };
}
