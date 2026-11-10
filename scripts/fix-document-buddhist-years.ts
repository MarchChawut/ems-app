/**
 * ==================================================
 * Fix Document Register Buddhist Years - แก้ปี พ.ศ. ที่ถูกบันทึกผิดใน DocumentRegister.date
 * ==================================================
 * บั๊ก: เช่นเดียวกับ Leave.startDate/endDate (ดู fix-leave-buddhist-years.ts) —
 * บาง record ของทะเบียนรับ-ส่งหนังสือถูกบันทึกปีเป็น พ.ศ. (เช่น 2569) แทนที่จะเป็น
 * ค.ศ. (2026) ทำให้ DB เก็บปีผิด แล้วตอนแสดงผล toLocaleDateString('th-TH') บวก 543 ซ้ำ
 * กลายเป็น 3112
 *
 * สคริปต์นี้:
 * 1. หา DocumentRegister ที่ date ปี >= 2500 (พ.ศ. ที่ติดมาผิด)
 * 2. ลบ 543 ออกจากปีของ date
 *
 * การใช้งาน:
 *   npx tsx scripts/fix-document-buddhist-years.ts --dry-run   # ตรวจก่อน ไม่เขียน DB
 *   npx tsx scripts/fix-document-buddhist-years.ts             # รันจริง
 *
 * Idempotent: รันซ้ำได้ปลอดภัย เพราะจะไม่พบแถวที่ปี >= 2500 อีกหลังแก้แล้ว
 */

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

// Load .env manually (เหมือน scripts/fix-leave-buddhist-years.ts)
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

async function main() {
  console.log(`=== Fix Document Register Buddhist Years ${DRY_RUN ? '(DRY RUN)' : ''} ===`);

  const badDocuments = await prisma.documentRegister.findMany({
    where: { date: { gte: new Date('2500-01-01') } },
  });

  console.log(`พบเอกสารที่ปีผิด: ${badDocuments.length} แถว`);

  for (const doc of badDocuments) {
    const newDate = fixYear(doc.date);
    console.log(`  #${doc.id}: ${doc.date.toISOString().slice(0, 10)} -> ${newDate.toISOString().slice(0, 10)}`);

    if (!DRY_RUN) {
      await prisma.documentRegister.update({
        where: { id: doc.id },
        data: { date: newDate },
      });
    }
  }

  console.log(`\nเสร็จสิ้น: แก้ไข ${badDocuments.length} แถว ${DRY_RUN ? '(dry-run ไม่ได้เขียน DB)' : ''}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
