/**
 * เรียกที่ต้นไฟล์เทสที่ต้องใช้ฐานข้อมูล — ลงทะเบียน beforeEach ที่ reset + seed baseline
 * ให้ทุกเทสเริ่มจากสถานะฐานข้อมูลที่รู้แน่ชัดและแยกจากกัน
 */

import { beforeEach } from 'vitest';
import { resetTestDatabase, seedBaseline } from '../db-reset';

export function setupTestDatabase(): void {
  beforeEach(async () => {
    await resetTestDatabase();
    await seedBaseline();
  });
}
