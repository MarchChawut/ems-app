import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/login';
import { E2E_ADMIN_USERNAME, E2E_PASSWORD } from './constants';

test('สร้างงานใหม่แล้วเห็นบน Kanban board', async ({ page }) => {
  await loginAs(page, E2E_ADMIN_USERNAME, E2E_PASSWORD);

  await page.goto('/dashboard/tasks');
  await page.getByRole('button', { name: 'เพิ่มงานใหม่' }).click();

  const title = `E2E task ${Date.now()}`;
  await page.getByPlaceholder('ระบุสิ่งที่ต้องทำ...').fill(title);
  await page.getByRole('button', { name: 'บันทึกงาน' }).click();

  await expect(page.getByText(title)).toBeVisible();
});
