/**
 * ==================================================
 * Fix HTML Entity Escaped Text - แก้ข้อความที่ถูกเข้ารหัส HTML entity ผิดพลาดในฐานข้อมูล
 * ==================================================
 * บั๊ก: sanitizeInput() (src/lib/security.ts) เคยเข้ารหัส & < > " ' / เป็น HTML entity
 * (เช่น "/" -> "&#x2F;") ก่อนบันทึกลง DB ทุกครั้งที่สร้าง/แก้ไข Task, Leave, User
 * แต่หน้าเว็บแสดงข้อความเหล่านี้เป็น plain text (React auto-escape ตอน render อยู่แล้ว)
 * ทำให้ผู้ใช้เห็นตัวอักษร entity ดิบๆ แทนที่จะเห็น "/" ตามที่พิมพ์จริง
 * (เช่น "วันที่ 15,27&#x2F;7&#x2F;69" แทนที่จะเป็น "วันที่ 15,27/7/69")
 *
 * บางแถวถูก encode ซ้ำหลายชั้น เพราะ sanitizeInput ถูกเรียกซ้ำทุกครั้งที่บันทึก
 * (แก้ไขงาน/รายการลาซ้ำหลายรอบ) สคริปต์นี้จึง decode วนซ้ำจนกว่าค่าจะนิ่ง ไม่ใช่รอบเดียว
 *
 * สคริปต์นี้:
 * 1. หา Task/Leave/User ที่ฟิลด์ข้อความมี HTML entity ที่ sanitizeInput เคยสร้างไว้
 * 2. Decode entity ทั้ง 6 แบบพร้อมกันในรอบเดียว แล้ววนซ้ำจนค่าไม่เปลี่ยนอีก (มี cap กันวนไม่รู้จบ)
 * 3. อัปเดตเฉพาะแถว/ฟิลด์ที่ค่าจริงต่างจากเดิมหลัง decode
 *
 * สำคัญ: ต้อง deploy โค้ดที่เลิกเรียก sanitizeInput() ก่อน แล้วค่อยรันสคริปต์นี้
 * (ไม่งั้นข้อมูลที่เพิ่งแก้ไขระหว่างนั้นจะถูกเข้ารหัสซ้ำอีกจากโค้ดเก่า)
 *
 * การใช้งาน:
 *   npx tsx scripts/fix-html-entity-escaped-text.ts --dry-run   # ตรวจก่อน ไม่เขียน DB
 *   npx tsx scripts/fix-html-entity-escaped-text.ts             # รันจริง
 *
 * Idempotent: รันซ้ำได้ปลอดภัย เพราะรอบสองจะไม่พบข้อความที่มี entity เหลืออยู่แล้ว
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

// แผนที่ entity -> อักขระจริง (ต้อง decode ทั้งหมดพร้อมกันในรอบเดียว
// ไม่ใช่ .replace() ต่อกันทีละแบบ เพราะแบบนั้นคือสาเหตุที่ escape ซ้อนกันข้ามชั้นได้ตั้งแต่แรก)
const ENTITY_MAP: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#x27;': "'",
  '&#x2F;': '/',
};
const ENTITY_REGEX = /&amp;|&lt;|&gt;|&quot;|&#x27;|&#x2F;/g;
const MAX_DECODE_PASSES = 10; // กันวนไม่รู้จบ เผื่อกรณีคนพิมพ์ "&amp;" เองจริงๆ

function decodeOnePass(value: string): string {
  return value.replace(ENTITY_REGEX, (match) => ENTITY_MAP[match]);
}

function fullyDecode(value: string): string {
  let current = value;
  for (let i = 0; i < MAX_DECODE_PASSES; i++) {
    const next = decodeOnePass(current);
    if (next === current) return next;
    current = next;
  }
  return current;
}

type FieldChange = { field: string; before: string; after: string };

function diffFields<T extends Record<string, unknown>>(
  row: T,
  fields: (keyof T & string)[]
): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const field of fields) {
    const value = row[field];
    if (typeof value !== 'string' || !value) continue;
    const decoded = fullyDecode(value);
    if (decoded !== value) {
      changes.push({ field, before: value, after: decoded });
    }
  }
  return changes;
}

async function fixTasks() {
  const tasks = await prisma.task.findMany();
  const fields = ['title', 'description'] as const;
  let changedCount = 0;

  for (const task of tasks) {
    const changes = diffFields(task, [...fields]);
    if (changes.length === 0) continue;

    changedCount++;
    console.log(`  Task #${task.id}:`);
    for (const c of changes) {
      console.log(`    ${c.field}: "${c.before}" -> "${c.after}"`);
    }

    if (!DRY_RUN) {
      const data: Record<string, string> = {};
      for (const c of changes) data[c.field] = c.after;
      await prisma.task.update({ where: { id: task.id }, data });
    }
  }

  console.log(`Task: แก้ไข ${changedCount} แถว (จากทั้งหมด ${tasks.length} แถว)`);
}

async function fixLeaves() {
  const leaves = await prisma.leave.findMany();
  const fields = ['reason', 'contactAddress'] as const;
  let changedCount = 0;

  for (const leave of leaves) {
    const changes = diffFields(leave, [...fields]);
    if (changes.length === 0) continue;

    changedCount++;
    console.log(`  Leave #${leave.id}:`);
    for (const c of changes) {
      console.log(`    ${c.field}: "${c.before}" -> "${c.after}"`);
    }

    if (!DRY_RUN) {
      const data: Record<string, string> = {};
      for (const c of changes) data[c.field] = c.after;
      await prisma.leave.update({ where: { id: leave.id }, data });
    }
  }

  console.log(`Leave: แก้ไข ${changedCount} แถว (จากทั้งหมด ${leaves.length} แถว)`);
}

async function fixUsers() {
  const users = await prisma.user.findMany();
  const fields = [
    'email',
    'username',
    'prefix',
    'name',
    'department',
    'division',
    'position',
    'positionSecond',
    'phone',
    'address',
  ] as const;
  let changedCount = 0;

  for (const user of users) {
    const changes = diffFields(user, [...fields]);
    if (changes.length === 0) continue;

    changedCount++;
    console.log(`  User #${user.id} (${user.username}):`);
    for (const c of changes) {
      console.log(`    ${c.field}: "${c.before}" -> "${c.after}"`);
    }

    if (!DRY_RUN) {
      const data: Record<string, string> = {};
      for (const c of changes) data[c.field] = c.after;
      await prisma.user.update({ where: { id: user.id }, data });
    }
  }

  console.log(`User: แก้ไข ${changedCount} แถว (จากทั้งหมด ${users.length} แถว)`);
}

async function main() {
  console.log(`=== Fix HTML Entity Escaped Text ${DRY_RUN ? '(DRY RUN)' : ''} ===`);
  await fixTasks();
  await fixLeaves();
  await fixUsers();
  console.log(`\nเสร็จสิ้น ${DRY_RUN ? '(dry-run ไม่ได้เขียน DB)' : ''}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
