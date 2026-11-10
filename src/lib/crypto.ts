/**
 * ==================================================
 * Crypto Utilities - การเข้ารหัสข้อมูลที่อ่อนไหว (at rest)
 * ==================================================
 * ใช้ AES-256-GCM เข้ารหัส TOTP secret ก่อนเก็บลงฐานข้อมูล
 * คีย์มาจาก env `TWO_FACTOR_ENC_KEY` (base64 ของ 32 ไบต์)
 * สร้างคีย์ด้วย: openssl rand -base64 32
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const IV_LENGTH = 12; // ความยาว IV มาตรฐานของ GCM (ไบต์)
const KEY_LENGTH = 32; // AES-256 ต้องการคีย์ 32 ไบต์

/**
 * อ่านและตรวจสอบคีย์เข้ารหัสจาก env
 * @throws หาก `TWO_FACTOR_ENC_KEY` ไม่ถูกตั้งค่าหรือความยาวไม่ถูกต้อง
 */
function getKey(): Buffer {
  const raw = process.env.TWO_FACTOR_ENC_KEY;
  if (!raw) {
    throw new Error('TWO_FACTOR_ENC_KEY is not set (ต้องตั้งค่าก่อนใช้งาน 2FA)');
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `TWO_FACTOR_ENC_KEY ต้องเป็น base64 ของ ${KEY_LENGTH} ไบต์ (สร้างด้วย: openssl rand -base64 32)`
    );
  }
  return key;
}

/**
 * เข้ารหัสข้อความด้วย AES-256-GCM
 * @param plaintext - ข้อความต้นฉบับ
 * @returns {string} base64 ของ iv(12) + authTag(16) + ciphertext
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

/**
 * ถอดรหัสข้อความที่เข้ารหัสด้วย {@link encrypt}
 * @param payload - base64 ที่ได้จาก encrypt
 * @returns {string} ข้อความต้นฉบับ
 */
export function decrypt(payload: string): string {
  const key = getKey();
  const data = Buffer.from(payload, 'base64');
  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + 16);
  const ciphertext = data.subarray(IV_LENGTH + 16);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
