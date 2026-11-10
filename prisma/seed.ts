/**
 * ==================================================
 * Prisma Seed - ข้อมูลเริ่มต้นสำหรับระบบ (CLI)
 * ==================================================
 * รัน: pnpm db:seed  (หรือ npx prisma db seed)
 * รายละเอียดและตัวแปร environment ดูที่ prisma/seed-lib.ts และ docs/GETTING-STARTED.md
 */

import { PrismaClient } from '@prisma/client';
import { runSeed } from './seed-lib';

const prisma = new PrismaClient();

runSeed(prisma)
  .catch((e) => {
    console.error('❌ เกิดข้อผิดพลาด:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
