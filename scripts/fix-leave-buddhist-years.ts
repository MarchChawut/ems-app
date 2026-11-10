/**
 * ==================================================
 * Fix Leave Buddhist Years - แก้ปี พ.ศ. ที่ถูกบันทึกผิดใน Leave.startDate/endDate
 * ==================================================
 * บั๊ก: ฟอร์มลา (native <input type="date"> บน locale ไทย) เคยส่งปีเป็น พ.ศ.
 * (เช่น 2569) แทนที่จะเป็น ค.ศ. (2026) ทำให้ DB เก็บปีผิดไปหมด แล้วตอนแสดงผล
 * toLocaleDateString('th-TH') บวก 543 ซ้ำ กลายเป็น 3112
 *
 * สคริปต์นี้:
 * 1. หา Leave ที่ startDate/endDate ปี >= 2500 (พ.ศ. ที่ติดมาผิด)
 * 2. ลบ 543 ออกจากปีของทั้งสองฟิลด์
 * 3. คำนวณ totalDays ใหม่สำหรับรายการลาเต็มวัน (ไม่ใช่ครึ่งวัน/ชม.)
 *    เพราะปีที่ถูกต้องทำให้วันในสัปดาห์เปลี่ยน อาจกระทบวันหยุดเสาร์-อาทิตย์
 *
 * การใช้งาน:
 *   npx tsx scripts/fix-leave-buddhist-years.ts --dry-run   # ตรวจก่อน ไม่เขียน DB
 *   npx tsx scripts/fix-leave-buddhist-years.ts             # รันจริง
 *
 * Idempotent: รันซ้ำได้ปลอดภัย เพราะจะไม่พบแถวที่ปี >= 2500 อีกหลังแก้แล้ว
 */

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

// Load .env manually (เหมือน scripts/migrate-uploads-to-db.ts)
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

function fixYear(d: Date): Date {
  const fixed = new Date(d);
  fixed.setFullYear(d.getFullYear() - 543);
  return fixed;
}

// นับวันทำการ (จันทร์-ศุกร์ ที่ไม่ใช่วันหยุด) เหมือน logic ใน src/app/api/leaves/route.ts
function calculateWorkingDays(start: Date, end: Date, holidays: Date[]): number {
  let count = 0;
  const current = new Date(start);
  current.setHours(0, 0, 0, 0);
  const endDay = new Date(end);
  endDay.setHours(0, 0, 0, 0);
  while (current <= endDay) {
    const dayOfWeek = current.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      const isHoliday = holidays.some(
        (h) =>
          h.getFullYear() === current.getFullYear() &&
          h.getMonth() === current.getMonth() &&
          h.getDate() === current.getDate()
      );
      if (!isHoliday) count++;
    }
    current.setDate(current.getDate() + 1);
  }
  return count;
}

async function main() {
  console.log(`=== Fix Leave Buddhist Years ${DRY_RUN ? '(DRY RUN)' : ''} ===`);

  const badLeaves = await prisma.leave.findMany({
    where: {
      OR: [
        { startDate: { gte: new Date('2500-01-01') } },
        { endDate: { gte: new Date('2500-01-01') } },
      ],
    },
  });

  console.log(`พบรายการลาที่ปีผิด: ${badLeaves.length} แถว`);

  let holidayRecords: { date: Date }[] = [];
  try {
    holidayRecords = await prisma.holiday.findMany({ where: { isActive: true }, select: { date: true } });
  } catch {
    // ถ้ายังไม่มีตาราง holiday ให้ข้ามไป
  }
  const holidays = holidayRecords.map((h) => h.date);

  let totalDaysChanged = 0;

  for (const leave of badLeaves) {
    const newStart = fixYear(leave.startDate);
    const newEnd = fixYear(leave.endDate);

    let newTotalDays = leave.totalDays;
    const isFullDayLeave = !leave.isHalfDay && !(leave.hours && leave.hours > 0);
    if (isFullDayLeave) {
      newTotalDays = calculateWorkingDays(newStart, newEnd, holidays);
    }

    const totalDaysWillChange = newTotalDays !== leave.totalDays;
    if (totalDaysWillChange) totalDaysChanged++;

    console.log(
      `  #${leave.id}: ${leave.startDate.toISOString().slice(0, 10)} -> ${newStart
        .toISOString()
        .slice(0, 10)}` +
        (leave.startDate.getTime() !== leave.endDate.getTime() || newStart.getTime() !== newEnd.getTime()
          ? ` | ${leave.endDate.toISOString().slice(0, 10)} -> ${newEnd.toISOString().slice(0, 10)}`
          : '') +
        (totalDaysWillChange ? ` | totalDays: ${leave.totalDays} -> ${newTotalDays}` : '')
    );

    if (!DRY_RUN) {
      await prisma.leave.update({
        where: { id: leave.id },
        data: { startDate: newStart, endDate: newEnd, totalDays: newTotalDays },
      });
    }
  }

  console.log(
    `\nเสร็จสิ้น: แก้ไข ${badLeaves.length} แถว (totalDays เปลี่ยน ${totalDaysChanged} แถว) ${
      DRY_RUN ? '(dry-run ไม่ได้เขียน DB)' : ''
    }`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
