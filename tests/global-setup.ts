/**
 * Vitest globalSetup — รันครั้งเดียวก่อนเทสทั้งชุด (คนละ process context จาก setupFiles)
 * ทำ migration ของฐานข้อมูลเทสให้ทันสคีมาล่าสุดก่อนเริ่มเทส
 */

import { execSync } from 'child_process';
import { loadTestEnv } from './load-test-env';
import { assertTestDatabase } from './db-guard';

export default async function globalSetup(): Promise<void> {
  loadTestEnv();
  assertTestDatabase();

  const redacted = (process.env.DATABASE_URL || '').replace(/:\/\/[^@]+@/, '://<redacted>@');
  console.log(`[global-setup] ใช้ DATABASE_URL=${redacted}`);

  execSync('pnpm exec prisma migrate deploy', {
    stdio: 'inherit',
    env: process.env,
  });
}
