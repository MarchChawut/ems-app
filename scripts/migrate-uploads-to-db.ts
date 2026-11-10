/**
 * ==================================================
 * Migrate Uploads to DB - ย้ายไฟล์รูป/เอกสารเดิมจากดิสก์เข้าฐานข้อมูล
 * ==================================================
 * เดิมไฟล์ถูกเก็บที่ public/uploads/ (documents, profiles) และ DB เก็บ path `/uploads/...`
 * สคริปต์นี้อ่านไฟล์จากดิสก์ → insert ลงตาราง uploaded_files → อัปเดต
 * imageUrl / documentUrl ของ assets และ supplies และ profileImage ของ users ให้ชี้ไปที่ `/api/files/<id>`
 *
 * การใช้งาน:
 *   npx tsx scripts/migrate-uploads-to-db.ts --dry-run   # ตรวจก่อน ไม่เขียน DB
 *   npx tsx scripts/migrate-uploads-to-db.ts             # รันจริง
 *
 * Idempotent: ข้ามรายการที่ชี้ไป /api/files/ แล้ว และข้ามไฟล์ที่หาไม่เจอบนดิสก์
 * ต้องรันบนเครื่องที่มีไฟล์จริงอยู่ใน public/uploads/documents/
 */

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

// Load .env manually (เหมือน scripts/import-assets.ts)
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
const PUBLIC_DIR = path.resolve(__dirname, '../public');

const MIME_BY_EXT: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

// แปลง path เดิม (/uploads/documents/xxx) → /api/files/<id> ; คืน null ถ้าข้าม
async function migrateOne(url: string | null): Promise<string | null> {
  if (!url || !url.startsWith('/uploads/')) return null; // ข้าม null / ที่ย้ายแล้ว
  const filePath = path.join(PUBLIC_DIR, url);
  if (!fs.existsSync(filePath)) {
    console.warn(`  ! ไฟล์หาย ข้าม: ${url}`);
    return null;
  }
  const buf = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = MIME_BY_EXT[ext] || 'application/octet-stream';
  const fileName = path.basename(filePath);
  if (DRY_RUN) {
    console.log(`  [dry] จะย้าย ${url} (${buf.length} bytes, ${mimeType})`);
    return '/api/files/DRY';
  }
  const rec = await prisma.uploadedFile.create({
    data: { data: buf, mimeType, fileName, size: buf.length },
    select: { id: true },
  });
  return `/api/files/${rec.id}`;
}

async function main() {
  console.log(`=== Migrate uploads to DB ${DRY_RUN ? '(DRY RUN)' : ''} ===`);
  let moved = 0;

  // Assets
  const assets = await prisma.asset.findMany({
    where: { OR: [{ imageUrl: { startsWith: '/uploads/' } }, { documentUrl: { startsWith: '/uploads/' } }] },
    select: { id: true, imageUrl: true, documentUrl: true },
  });
  console.log(`Assets ที่มีไฟล์บนดิสก์: ${assets.length}`);
  for (const a of assets) {
    const newImage = await migrateOne(a.imageUrl);
    const newDoc = await migrateOne(a.documentUrl);
    if ((newImage || newDoc) && !DRY_RUN) {
      await prisma.asset.update({
        where: { id: a.id },
        data: { ...(newImage ? { imageUrl: newImage } : {}), ...(newDoc ? { documentUrl: newDoc } : {}) },
      });
    }
    if (newImage) moved++;
    if (newDoc) moved++;
  }

  // Supplies
  const supplies = await prisma.supply.findMany({
    where: { OR: [{ imageUrl: { startsWith: '/uploads/' } }, { documentUrl: { startsWith: '/uploads/' } }] },
    select: { id: true, imageUrl: true, documentUrl: true },
  });
  console.log(`Supplies ที่มีไฟล์บนดิสก์: ${supplies.length}`);
  for (const s of supplies) {
    const newImage = await migrateOne(s.imageUrl);
    const newDoc = await migrateOne(s.documentUrl);
    if ((newImage || newDoc) && !DRY_RUN) {
      await prisma.supply.update({
        where: { id: s.id },
        data: { ...(newImage ? { imageUrl: newImage } : {}), ...(newDoc ? { documentUrl: newDoc } : {}) },
      });
    }
    if (newImage) moved++;
    if (newDoc) moved++;
  }

  // รูปโปรไฟล์ผู้ใช้ (เดิมอยู่ public/uploads/profiles ที่ใครก็เปิดได้โดยไม่ต้องล็อกอิน → ย้ายเข้า DB เปิดผ่าน /api/files ที่ต้องล็อกอิน)
  const users = await prisma.user.findMany({
    where: { profileImage: { startsWith: '/uploads/' } },
    select: { id: true, profileImage: true },
  });
  console.log(`Users ที่มีรูปโปรไฟล์บนดิสก์: ${users.length}`);
  for (const u of users) {
    const newImage = await migrateOne(u.profileImage);
    if (newImage && !DRY_RUN) {
      await prisma.user.update({ where: { id: u.id }, data: { profileImage: newImage } });
    }
    if (newImage) moved++;
  }

  console.log(`\nเสร็จสิ้น: ย้าย ${moved} ไฟล์ ${DRY_RUN ? '(dry-run ไม่ได้เขียน DB)' : ''}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
