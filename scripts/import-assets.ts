/**
 * ==================================================
 * Asset Import Utility - นำเข้าครุภัณฑ์จากไฟล์ Excel
 * ==================================================
 * นำเข้าข้อมูลจาก "รายการครุภัณฑ์ที่ใช้งาน กองการศึกษา วิจัย และพัฒนา.xlsx"
 * เข้าตาราง assets (และ auto-create asset_categories)
 *
 * การใช้งาน:
 *   npx tsx scripts/import-assets.ts --dry-run   # ตรวจก่อน ไม่เขียน DB
 *   npx tsx scripts/import-assets.ts             # รันจริง (transaction)
 *   หรือ  pnpm db:import-assets [--dry-run]
 *
 * Idempotent: รันซ้ำได้ — ลบ asset เดิมที่ (serialNumber+name+location) ตรงกันก่อน insert
 */

import * as fs from 'fs';
import * as path from 'path';
import ExcelJS from 'exceljs';
import { PrismaClient, AssetStatus } from '@prisma/client';

// Load .env manually (เหมือน scripts/backup.ts)
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
const FILE = path.resolve(__dirname, '../รายการครุภัณฑ์ที่ใช้งาน กองการศึกษา วิจัย และพัฒนา.xlsx');

// ----- helpers -----
const PERSON_RE = /^(นาย|น\.ส\.|นาง|พ\.อ\.|พ\.ท\.|พ\.ต\.|ร\.ท\.|ร\.อ\.|ร\.ต\.|ส\.อ\.|จ\.ส\.อ\.|พล\.)/;
const clean = (v: unknown): string =>
  (v == null ? '' : String(v)).replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
const isPerson = (s: string) => PERSON_RE.test(s.trim());
// normalize ชื่อคน: ตัด prefix, ตัด annotation "**...", ตัดช่องว่างทั้งหมด
const stripName = (s: string) => s.replace(PERSON_RE, '').replace(/\*+.*$/, '').trim();
const normName = (s: string) => stripName(s).replace(/\s+/g, '');

interface Row {
  sheet: string;
  serialNumber: string;   // เลขครุภัณฑ์
  name: string;           // รายการครุภัณฑ์
  spec: string;           // คุณสมบัติ/รายละเอียด (col D)
  ownerCol: string;       // ชื่อหน่วยงานที่ครอบครอง (col E)
  location: string;       // สถานที่ตั้ง (col F)
  noteCol: string;        // หมายเหตุ (col G)
}

/** แปลงค่าใน cell ของ ExcelJS ให้เป็นค่าพื้นฐาน (ข้อความ/ตัวเลข/null) — สูตรใช้ผลลัพธ์, rich text รวมเป็นข้อความ */
function cellValue(v: ExcelJS.CellValue): string | number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') {
    if (v instanceof Date) return v.toISOString();
    if ('result' in v) return (v.result as string | number | null) ?? null; // สูตร
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
    if ('text' in v) return String(v.text); // hyperlink
    return null;
  }
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v;
}

function parseSheet(ws: ExcelJS.Worksheet, sheet: string): Row[] {
  // เทียบเท่า sheet_to_json(header:1): แต่ละแถวเป็น array ตามคอลัมน์ (เริ่มที่ index 0 = คอลัมน์ A)
  const rows: any[][] = [];
  ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const arr: any[] = [];
    for (let c = 1; c <= Math.max(row.cellCount, 7); c++) arr.push(cellValue(row.getCell(c).value));
    rows[rowNumber - 1] = arr;
  });
  const hdr = rows.findIndex((r) => r && r[0] === 'ลำดับ');
  if (hdr < 0) return [];
  return rows
    .slice(hdr + 1)
    .filter((r) => r && typeof r[0] === 'number')
    .map((r) => ({
      sheet,
      serialNumber: clean(r[1]),
      name: clean(r[2]),
      spec: clean(r[3]),
      ownerCol: clean(r[4]),
      location: clean(r[5]),
      noteCol: clean(r[6]),
    }));
}

// derive category name per row
function categoryOf(row: Row): string {
  if (row.sheet === 'ทรัพย์สินดิจิทัล') return row.spec || 'ทรัพย์สินดิจิทัล';      // col D = หมวดหมู่
  if (row.sheet === 'อุปกรณ์ต่อพ่วง') return 'อุปกรณ์ต่อพ่วง';
  // แผ่นครุภัณฑ์: ใช้ชื่อฐาน ตัด " (n)" ท้าย
  return row.name.replace(/\s*\(\d+\)\s*$/, '').trim() || 'ครุภัณฑ์';
}

async function main() {
  console.log(`\n=== Import Assets ${DRY_RUN ? '(DRY-RUN)' : '(LIVE)'} ===`);
  if (!fs.existsSync(FILE)) throw new Error('ไม่พบไฟล์ Excel: ' + FILE);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE);
  const rows: Row[] = [];
  for (const name of ['ครุภัณฑ์', 'ทรัพย์สินดิจิทัล', 'อุปกรณ์ต่อพ่วง']) {
    const ws = wb.getWorksheet(name);
    if (ws) rows.push(...parseSheet(ws, name));
  }
  console.log('รวมแถวที่อ่านได้:', rows.length);
  for (const s of ['ครุภัณฑ์', 'ทรัพย์สินดิจิทัล', 'อุปกรณ์ต่อพ่วง'])
    console.log(`  - ${s}: ${rows.filter((r) => r.sheet === s).length}`);

  // ----- assetTag uniqueness (ทั้งไฟล์) -----
  const serialCount = new Map<string, number>();
  rows.forEach((r) => serialCount.set(r.serialNumber, (serialCount.get(r.serialNumber) || 0) + 1));
  const dupSerials = [...serialCount.entries()].filter(([, c]) => c > 1);

  // ----- holder matching -----
  const users = await prisma.user.findMany({ select: { id: true, name: true, role: true } });
  const userMap = new Map<string, number>();
  users.forEach((u) => userMap.set(u.name.replace(/\s+/g, ''), u.id));
  // ผู้ออกใบยืม (issuer) สำหรับ AssetCheckout — ใช้ admin คนแรก, fallback = ตัวผู้ครอบครองเอง
  const adminIssuerId =
    users.find((u) => u.role === 'SUPER_ADMIN' || u.role === 'ADMIN')?.id ?? null;

  const unmatchedHolders = new Set<string>();
  function holderName(row: Row): string {
    // แผ่น1 ชื่อคนอยู่ col G ; แผ่น2 อยู่ col E
    if (isPerson(row.noteCol)) return row.noteCol;
    if (isPerson(row.ownerCol)) return row.ownerCol;
    return '';
  }

  // ----- build asset records -----
  const cats = new Map<string, number>(); // name -> id (เติมตอน live)
  rows.forEach((r) => cats.set(categoryOf(r), 0));

  type Rec = {
    row: Row;
    data: {
      name: string;
      serialNumber: string | null;
      assetTag: string | null;
      categoryName: string;
      currentHolderId: number | null;
      status: AssetStatus;
      department: string | null;
      location: string | null;
      notes: string | null;
    };
  };

  const usedTag = new Set<string>();
  const records: Rec[] = rows.map((r) => {
    // assetTag เฉพาะเมื่อไม่ซ้ำทั้งไฟล์ และยังไม่ถูกใช้
    let assetTag: string | null = null;
    if (r.serialNumber && (serialCount.get(r.serialNumber) || 0) === 1 && !usedTag.has(r.serialNumber)) {
      assetTag = r.serialNumber;
      usedTag.add(r.serialNumber);
    }

    const hn = holderName(r);
    let holderId: number | null = null;
    if (hn) {
      const id = userMap.get(normName(hn));
      if (id) holderId = id;
      else unmatchedHolders.add(hn);
    }

    // department = col E เฉพาะเมื่อเป็นหน่วยงาน (ไม่ใช่ชื่อคน)
    const department = r.ownerCol && !isPerson(r.ownerCol) ? r.ownerCol : null;

    // notes: สเปก + จำนวน(แผ่น3) + holder ที่ match ไม่ได้
    const noteParts: string[] = [];
    if (r.spec && r.spec !== '-') noteParts.push(r.spec);
    if (r.sheet === 'อุปกรณ์ต่อพ่วง' && r.noteCol) noteParts.push('จำนวน: ' + r.noteCol);
    if (hn && !holderId) noteParts.push('ผู้ครอบครอง: ' + hn);

    return {
      row: r,
      data: {
        name: r.name || '(ไม่ระบุชื่อ)',
        serialNumber: r.serialNumber || null,
        assetTag,
        categoryName: categoryOf(r),
        currentHolderId: holderId,
        status: holderId ? AssetStatus.IN_USE : AssetStatus.AVAILABLE,
        department: department ? department.slice(0, 100) : null,
        location: r.location || null,
        notes: noteParts.length ? noteParts.join('\n').slice(0, 2000) : null,
      },
    };
  });

  const matched = records.filter((r) => r.data.currentHolderId).length;
  console.log('\nหมวดหมู่ที่จะสร้าง/ใช้:', cats.size);
  [...cats.keys()].slice(0, 30).forEach((c) => console.log('   •', c));
  console.log(`\nHolder match: ${matched}/${records.filter((r) => holderName(r.row)).length} แถวที่มีชื่อคน`);
  console.log('ชื่อที่ match User ไม่ได้ (จะเก็บใน notes):', unmatchedHolders.size);
  [...unmatchedHolders].forEach((h) => console.log('   ✗', h));
  console.log('\nเลขครุภัณฑ์ซ้ำ (assetTag=null, ใช้ serialNumber แทน):', dupSerials.length);
  dupSerials.forEach(([s, c]) => console.log(`   ⚠ ${s} x${c}`));

  console.log('\nตัวอย่าง 5 แถวแรก:');
  records.slice(0, 5).forEach((r, i) =>
    console.log(
      `  [${i}] ${r.data.name} | tag=${r.data.assetTag ?? '-'} | sn=${r.data.serialNumber} | ` +
        `cat=${r.data.categoryName} | holder=${r.data.currentHolderId ?? '-'} | ${r.data.status} | loc=${r.data.location ?? '-'}`
    )
  );

  if (DRY_RUN) {
    console.log('\n[DRY-RUN] ไม่เขียนฐานข้อมูล — รันโดยไม่ใส่ --dry-run เพื่อ import จริง\n');
    return;
  }

  // ----- LIVE: upsert categories -----
  let order = 0;
  for (const name of cats.keys()) {
    const c = await prisma.assetCategory.upsert({
      where: { name: name.slice(0, 100) },
      update: {},
      create: { name: name.slice(0, 100), order: order++ },
    });
    cats.set(name, c.id);
  }
  console.log('\nสร้าง/ยืนยันหมวดหมู่:', cats.size);

  // ----- LIVE: idempotent insert in transaction -----
  // ลบ asset ที่อยู่ในหมวดของ import นี้ทั้งหมดก่อน แล้ว insert ใหม่
  // (ไม่ใช้ key composite เพราะมีรายการซ้ำจริง เช่น HPE Server 2 เครื่อง ที่ชื่อ+เลข+ที่ตั้งเหมือนกัน)
  const importedCatIds = [...cats.values()];
  let created = 0;
  await prisma.$transaction(
    async (tx) => {
      // ลบ asset ในหมวด import (AssetCheckout จะถูกลบตาม onDelete: Cascade)
      await tx.asset.deleteMany({ where: { categoryId: { in: importedCatIds } } });
      for (const rec of records) {
        const d = rec.data;
        const asset = await tx.asset.create({
          data: {
            name: d.name,
            serialNumber: d.serialNumber,
            assetTag: d.assetTag,
            categoryId: cats.get(d.categoryName) ?? null,
            currentHolderId: d.currentHolderId,
            status: d.status,
            department: d.department,
            location: d.location,
            notes: d.notes,
          },
        });
        // ครุภัณฑ์ที่มีผู้ครอบครอง → สร้างใบยืมที่ยังไม่คืน เพื่อให้รับคืนผ่าน UI ได้
        if (d.currentHolderId) {
          await tx.assetCheckout.create({
            data: {
              assetId: asset.id,
              holderId: d.currentHolderId,
              issuedById: adminIssuerId ?? d.currentHolderId,
              notes: 'นำเข้าจากไฟล์ Excel (รายการครุภัณฑ์ที่ใช้งาน)',
            },
          });
        }
        created++;
      }
    },
    { timeout: 120000 }
  );

  const total = await prisma.asset.count();
  const catTotal = await prisma.assetCategory.count();
  console.log(`\n✅ Import สำเร็จ: insert ${created} แถว | assets ในระบบ=${total} | หมวดหมู่=${catTotal}\n`);
}

main()
  .catch((e) => {
    console.error('❌ Import ล้มเหลว:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
