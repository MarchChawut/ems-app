/**
 * Vitest setupFiles — รันก่อนทุกไฟล์เทส (คนละรอบต่อไฟล์)
 * แค่โหลด .env.test + เช็ค safety guard เท่านั้น — "ไม่" reset ฐานข้อมูลที่นี่
 * เพราะเทสหน่วย (pure functions ใน src/lib) ไม่ควรต้องพึ่งฐานข้อมูลเลย
 * เทสที่ต้องใช้ฐานข้อมูลให้เรียก setupTestDatabase() จาก tests/helpers/with-test-db.ts เอง
 */

import { beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { loadTestEnv } from './load-test-env';
import { assertTestDatabase } from './db-guard';
import { mockCookieStore, resetMockCookies } from './helpers/mock-cookies';

loadTestEnv();
assertTestDatabase();

// Mock next/headers ทั้ง suite — ดูเหตุผลใน tests/helpers/mock-cookies.ts
// (ไม่มีผลกับเทสหน่วยที่ไม่ import next/headers เลย จึงปลอดภัยที่จะตั้งไว้แบบ global)
vi.mock('next/headers', () => ({
  cookies: async () => mockCookieStore,
  headers: async () => new Headers(),
}));

beforeEach(() => {
  resetMockCookies();
});

// Safe even for non-component test files: cleanup() only touches `document` for
// roots that were actually rendered, and no-ops (never referencing `document`) when
// none were — so this is fine to register globally rather than per component test file.
afterEach(() => {
  cleanup();
});
