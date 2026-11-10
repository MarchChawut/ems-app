/**
 * Helper ล็อกอินสำหรับ E2E — ใช้ flow จริงทั้งหมด (username/password → TOTP → session)
 * ไม่ mock อะไรเลย: คำนวณรหัส TOTP จริงจาก E2E_TOTP_SECRET ด้วย otplib ตัวเดียวกับที่
 * ผู้ใช้จริงต้องกรอกจากแอป authenticator ของตัวเอง — เพื่อทดสอบ path /api/auth/2fa/verify จริง
 */

import { Page, expect } from '@playwright/test';
import { generate as generateTotp } from 'otplib';
import { E2E_TOTP_SECRET } from '../constants';

export async function loginWithCredentials(
  page: Page,
  username: string,
  password: string
): Promise<void> {
  await page.goto('/');
  // next dev คอมไพล์หน้าแรกช้า: ต้องรอให้ React hydrate ก่อนกรอก ไม่งั้นฟอร์ม submit แบบ native ด้วยค่าว่าง
  // (networkidle ใช้ไม่ได้: HMR websocket ของ next dev ไม่เคยนิ่ง) จึงเช็คว่า React ผูก props กับ input แล้ว
  await page.waitForFunction(() => {
    const el = document.querySelector('input');
    return !!el && Object.keys(el).some((k) => k.startsWith('__reactProps$'));
  });
  await page.getByLabel('ชื่อผู้ใช้').fill(username);
  await page.getByLabel('รหัสผ่าน').fill(password);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
}

export async function completeTotpVerification(page: Page): Promise<void> {
  const code = await generateTotp({ secret: E2E_TOTP_SECRET });
  await page.getByPlaceholder('••••••').fill(code);
  await page.getByRole('button', { name: 'ยืนยัน', exact: true }).click();
}

/** ล็อกอินแบบครบ flow (credentials + TOTP จริง) จนถึงหน้า /dashboard */
export async function loginAs(page: Page, username: string, password: string): Promise<void> {
  await loginWithCredentials(page, username, password);
  await expect(page.getByPlaceholder('••••••')).toBeVisible();
  await completeTotpVerification(page);
  await page.waitForURL('**/dashboard');
  // ทุก role มีเมนูผู้ใช้ (หน้าหลัก/dashboard เห็นเฉพาะ MANAGER ขึ้นไป — EMPLOYEE จะลงที่หน้าข้อมูลส่วนตัว)
  await expect(page.getByRole('button', { name: 'เมนูผู้ใช้' })).toBeVisible();
}
