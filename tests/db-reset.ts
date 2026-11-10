/**
 * ==================================================
 * Reset ฐานข้อมูลเทสให้กลับสู่สถานะเริ่มต้นก่อนแต่ละเทส
 * ==================================================
 */

// import แบบ relative (ไม่ใช่ @/lib/prisma) เพราะไฟล์นี้ถูก import จาก e2e/global-setup.ts
// ด้วย ซึ่ง Playwright ไม่มี plugin resolve alias ของ tsconfig ให้เหมือน Vitest
import { prisma } from '../src/lib/prisma';
import { assertTestDatabase } from './db-guard';
import { clearFeatureCache } from '../src/lib/feature-settings-server';

/** ลบข้อมูลทุกตาราง (ยกเว้น _prisma_migrations) แล้วรีเซ็ต FK checks กลับ */
export async function resetTestDatabase(): Promise<void> {
  assertTestDatabase();

  const tables = await prisma.$queryRaw<{ TABLE_NAME: string }[]>`
    SELECT TABLE_NAME FROM information_schema.tables
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME != '_prisma_migrations'
  `;

  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0');
  for (const { TABLE_NAME } of tables) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE \`${TABLE_NAME}\``);
  }
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1');
  // แคช feature flag ในหน่วยความจำ (TTL สั้น) ต้องล้างทุกครั้งที่ล้างตาราง ไม่งั้นสถานะจากเทสก่อนหน้ารั่วมาเทสถัดไป
  clearFeatureCache();
}

/** ข้อมูลอ้างอิงพื้นฐานที่หลายเทสคาดหวังว่ามีอยู่แล้ว (คอลัมน์ kanban เริ่มต้น) */
export async function seedBaseline(): Promise<void> {
  assertTestDatabase();

  await prisma.kanbanColumn.createMany({
    data: [
      { name: 'To Do', color: 'slate', order: 0, isDefault: true },
      { name: 'In Progress', color: 'blue', order: 1, isDefault: false },
      { name: 'Done', color: 'emerald', order: 2, isDefault: false },
    ],
  });
}
