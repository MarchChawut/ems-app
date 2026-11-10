/**
 * ==================================================
 * Playwright E2E config — ปลอดภัยจากฐานข้อมูล production โดยสมบูรณ์
 * ==================================================
 * แทนที่จะพึ่ง Next.js auto-load `.env.$NODE_ENV` (ไม่แน่นอนภายใต้ `next start`/`next dev`)
 * ไฟล์นี้อ่าน .env.test เองแล้วส่งเป็น webServer.env ตรงๆ — process.env ที่ตั้งไว้แล้วชนะ
 * ค่าที่ dotenv-style loader ใดๆ ในแอปจะพยายามตั้งทับ
 *
 * Safety guard ต้องอยู่ที่ module top level (ก่อน webServer ถูก spawn) — ไม่ใช่ใน globalSetup
 * ซึ่งรันหลัง webServer อาจเริ่มบูตไปแล้ว การเช็คตรงนี้ป้องกันไม่ให้ dev server เชื่อมต่อ
 * DATABASE_URL ที่ไม่ใช่ฐานข้อมูลเทสได้ตั้งแต่ก่อน process จะถูกสร้างขึ้นด้วยซ้ำ
 */

import { defineConfig, devices } from '@playwright/test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { E2E_BASE_URL, E2E_PORT } from './e2e/constants';

const TEST_DB_MARKER = /localhost:3307\/ems_test|127\.0\.0\.1:3307\/ems_test/;

function loadEnvFile(envPath: string): Record<string, string> {
  if (!fs.existsSync(envPath)) {
    throw new Error(`ไม่พบ ${envPath} — สร้างไฟล์นี้ก่อนรัน E2E (ดู .env.test.example)`);
  }
  const env: Record<string, string> = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) {
      env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
  return env;
}

const fileEnv = loadEnvFile(path.resolve(__dirname, '.env.test'));

// พอร์ตแยกจาก dev server ปกติ (3000) กันชนกับ instance ที่อาจรันอยู่แล้วบนเครื่อง
const webServerEnv: Record<string, string> = {
  ...fileEnv,
  PORT: String(E2E_PORT),
  NEXTAUTH_URL: E2E_BASE_URL,
  WEBAUTHN_ORIGIN: E2E_BASE_URL,
};

if (!TEST_DB_MARKER.test(webServerEnv.DATABASE_URL || '')) {
  const redacted = (webServerEnv.DATABASE_URL || '').replace(/:\/\/[^@]+@/, '://<redacted>@');
  throw new Error(
    `ปฏิเสธการรัน E2E: DATABASE_URL ไม่ใช่ฐานข้อมูลเทส\n` +
      `ต้องมี "localhost:3307/ems_test" อยู่ใน URL แต่ได้: ${redacted || '(ไม่ได้ตั้งค่า)'}\n` +
      `มาตรการนี้มีไว้เพื่อป้องกันไม่ให้ E2E server เชื่อมต่อฐานข้อมูล production จริงโดยไม่ตั้งใจ`
  );
}

export default defineConfig({
  testDir: './e2e',
  // เขียน artifact (trace/screenshot) นอกโฟลเดอร์โปรเจกต์: next dev (Turbopack) เฝ้าดูทั้งโปรเจกต์ ถ้าไฟล์ใน test-results
  // เปลี่ยนระหว่างเทสจะ trigger Fast Refresh → รีโหลดหน้าวนซ้ำจนกดปุ่มไม่ได้
  outputDir: path.join(os.tmpdir(), 'ems-playwright-results'),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  globalSetup: path.resolve(__dirname, './e2e/global-setup.ts'),
  use: {
    baseURL: E2E_BASE_URL,
    trace: 'retain-on-failure',
  },
  // next dev (ไม่ใช่ build+start): secure:false บน cookie สำคัญๆ (session, 2fa pending)
  // ขึ้นกับ process.env.NODE_ENV === 'production' ที่แอปอ่านตรงๆ — next start บังคับ
  // NODE_ENV=production เสมอ (ไม่สนใจค่าใน .env.test) ทำให้คุกกี้ตั้ง Secure และอาจไม่ถูกส่ง
  // กลับมาบน http://localhost อย่างน่าเชื่อถือ ส่วน next dev บังคับ development จริงตามที่ต้องการ
  webServer: {
    command: `pnpm exec next dev --port ${E2E_PORT}`,
    url: `${E2E_BASE_URL}/api/health`,
    env: webServerEnv,
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
