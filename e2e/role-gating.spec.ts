import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/login';
import { E2E_ADMIN_USERNAME, E2E_EMPLOYEE_USERNAME, E2E_PASSWORD } from './constants';

test('ผู้ใช้ role EMPLOYEE ไม่เห็นส่วน "จัดการบัญชีผู้ใช้" (เฉพาะ SUPER_ADMIN) ในหน้าตั้งค่า', async ({
  page,
}) => {
  await loginAs(page, E2E_EMPLOYEE_USERNAME, E2E_PASSWORD);
  await page.goto('/dashboard/settings');
  await expect(page.getByText('จัดการบัญชีผู้ใช้')).not.toBeVisible();
});

test('ผู้ใช้ role SUPER_ADMIN เห็นส่วน "จัดการบัญชีผู้ใช้" ในหน้าตั้งค่า', async ({ page }) => {
  await loginAs(page, E2E_ADMIN_USERNAME, E2E_PASSWORD);
  await page.goto('/dashboard/settings');
  await expect(page.getByText('จัดการบัญชีผู้ใช้')).toBeVisible();
});
