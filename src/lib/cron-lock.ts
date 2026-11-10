/**
 * ==================================================
 * Cron Lock - ป้องกัน cron job รันซ้อนกัน
 * ==================================================
 * ใช้ atomic claim บน CronLock.lockedAt แบบเดียวกับที่ใช้กันส่งซ้ำใน
 * Task.reminderSentAt (ดู src/app/api/cron/reminders/route.ts) แค่ทำที่ระดับ
 * "ทั้งรอบการรัน" แทนที่จะเป็นระดับแถวข้อมูล
 *
 * self-healing: ถ้า process ที่ถือ lock ตายกลางคันโดยไม่ได้ releaseLock lock
 * จะถูกปล่อยอัตโนมัติหลังผ่าน STALE_MS
 */

import { prisma } from '@/lib/prisma';

const STALE_MS = 5 * 60 * 1000; // 5 นาที - รันจริงเสร็จในหลักวินาที ไม่มีทางถูกแย่ง lock ผิดพลาด

export async function acquireLock(name: string, holder: string): Promise<boolean> {
  const now = new Date();

  // กันกรณีแถว lock ยังไม่มี (ครั้งแรก หรือหายไปเพราะ seed ไม่ครบ) - self-heal ไม่ต้องพึ่ง migration seed
  await prisma.cronLock.upsert({
    where: { name },
    create: { name, lockedAt: null },
    update: {},
  });

  const stale = new Date(now.getTime() - STALE_MS);
  const claim = await prisma.cronLock.updateMany({
    where: {
      name,
      OR: [{ lockedAt: null }, { lockedAt: { lt: stale } }],
    },
    data: { lockedAt: now, lockedBy: holder },
  });

  return claim.count === 1;
}

export async function releaseLock(name: string): Promise<void> {
  await prisma.cronLock.updateMany({
    where: { name },
    data: { lockedAt: null, lockedBy: null },
  });
}
