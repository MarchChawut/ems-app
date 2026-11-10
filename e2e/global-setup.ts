/**
 * Playwright globalSetup — รันครั้งเดียวก่อนเริ่มเทส E2E ทั้งหมด
 * รันเป็น process แยกจาก webServer จึงต้องโหลด .env.test + เช็ค safety guard เอง
 * (ไม่ได้รับ process.env มาจาก webServer.env โดยอัตโนมัติ)
 *
 * รีเซ็ตฐานข้อมูลเทสแล้ว seed ผู้ใช้ 2 คนที่เปิดใช้ 2FA ด้วย secret คงที่ที่รู้ค่าล่วงหน้า
 * (E2E_TOTP_SECRET) เข้ารหัสด้วย encrypt() ตัวเดียวกับที่ production ใช้จริง — ทำให้
 * e2e/helpers/login.ts คำนวณรหัส TOTP จริงด้วย otplib แล้วยืนยันผ่าน flow /api/auth/2fa/verify
 * จริงได้ทั้งหมด ไม่ต้อง mock ส่วนไหนเลย
 *
 * TWO_FACTOR_ENC_KEY ต้องตรงกันระหว่างที่นี่ (เข้ารหัส secret ตอน seed) กับ webServer
 * child process (ถอดรหัสตอน verify) — ทั้งคู่มาจาก .env.test ไฟล์เดียวกัน จึงตรงกันเสมอ
 */

import { loadTestEnv } from '../tests/load-test-env';
import { assertTestDatabase } from '../tests/db-guard';

loadTestEnv();
assertTestDatabase();

/* eslint-disable @typescript-eslint/no-var-requires */
async function globalSetup(): Promise<void> {
  const { prisma } = await import('../src/lib/prisma');
  const { resetTestDatabase, seedBaseline } = await import('../tests/db-reset');
  const { hashPassword, generateAvatarInitials } = await import('../src/lib/security');
  const { encrypt } = await import('../src/lib/crypto');
  const {
    E2E_TOTP_SECRET,
    E2E_PASSWORD,
    E2E_ADMIN_USERNAME,
    E2E_EMPLOYEE_USERNAME,
  } = await import('./constants');

  await resetTestDatabase();
  await seedBaseline();

  const password = await hashPassword(E2E_PASSWORD);
  const twoFactorSecret = encrypt(E2E_TOTP_SECRET);

  await prisma.user.create({
    data: {
      username: E2E_ADMIN_USERNAME,
      email: `${E2E_ADMIN_USERNAME}@example.test`,
      password,
      name: 'E2E Admin',
      role: 'SUPER_ADMIN',
      avatar: generateAvatarInitials('E2E Admin'),
      isActive: true,
      twoFactorEnabled: true,
      twoFactorSecret,
    },
  });

  await prisma.user.create({
    data: {
      username: E2E_EMPLOYEE_USERNAME,
      email: `${E2E_EMPLOYEE_USERNAME}@example.test`,
      password,
      name: 'E2E Employee',
      role: 'EMPLOYEE',
      avatar: generateAvatarInitials('E2E Employee'),
      isActive: true,
      twoFactorEnabled: true,
      twoFactorSecret,
    },
  });

  await prisma.$disconnect();
}

export default globalSetup;
