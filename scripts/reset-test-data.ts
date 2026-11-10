/**
 * ==================================================
 * Reset Test Data - แทนที่ข้อมูลจริงทั้งหมดด้วยข้อมูล dummy
 * ==================================================
 * ใช้สำหรับเตรียมฐานข้อมูลทดสอบ (เช่น ems_trd_dev) ให้ปลอดภัยสำหรับเทส:
 * 1. เหลือผู้ใช้แค่ 1 คนต่อ 1 role (6 คน) — role ที่ยังไม่มีอยู่จะถูกสร้างใหม่
 * 2. ลบผู้ใช้ที่เหลือทั้งหมด (cascade ลบ session/leave ของคนนั้นไปด้วยตามปกติของระบบ)
 * 3. แทนที่ข้อมูลจริง (ชื่อ อีเมล เบอร์โทร ที่อยู่ ฯลฯ) ในผู้ใช้ที่เหลือ และในตาราง
 *    อื่นๆ (พัสดุ ครุภัณฑ์ ทะเบียนหนังสือ login log ฯลฯ) ด้วยค่า dummy
 *    โดย "คงจำนวนแถวเดิมไว้" (ไม่ลบ) เพื่อให้ทดสอบหน้า list/pagination ได้จริง
 *
 * ป้องกันอุบัติเหตุ:
 * - เช็ค SELECT DATABASE() ก่อนเสมอ ถ้าเป็น "ems_trd" (ฐานข้อมูลจริง) จะหยุดทันที
 * - ไม่เขียนอะไรลง DB เลยถ้าไม่ใส่ --yes (ค่าเริ่มต้น = dry-run แสดงแผนอย่างเดียว)
 *
 * การใช้งาน:
 *   npx tsx scripts/reset-test-data.ts          # dry-run: แสดงแผน ไม่เขียน DB
 *   npx tsx scripts/reset-test-data.ts --yes     # รันจริง
 *
 * แนะนำให้ pnpm db:backup ก่อนรันจริงเสมอ
 */

import * as fs from 'fs';
import * as path from 'path';
import { randomBytes } from 'crypto';
import { PrismaClient, Role } from '@prisma/client';
import { hashPassword, generateAvatarInitials } from '../src/lib/security';

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
const YES = process.argv.includes('--yes');

// ฐานข้อมูลจริงที่ห้ามรันสคริปต์นี้เด็ดขาด ไม่ว่าจะใส่ flag อะไรก็ตาม
const FORBIDDEN_DB_NAME = 'ems_trd';

// รหัสผ่านของบัญชีทดสอบ: มาจาก TEST_ACCOUNT_PASSWORD (env, ≥ 12 ตัวอักษร) หรือสุ่มให้ทุกครั้งที่รัน (พิมพ์ครั้งเดียวตอนจบ)
// ห้ามฝังรหัสผ่านที่ทุกคนรู้ไว้ในโค้ด — ซอร์สนี้เผยแพร่ได้ บัญชีทดสอบระดับ SUPER_ADMIN จึงต้องไม่มีรหัสที่เดาได้จาก repo
const TEST_PASSWORD = (() => {
  const fromEnv = process.env.TEST_ACCOUNT_PASSWORD;
  if (fromEnv) {
    if (fromEnv.length < 12) throw new Error('TEST_ACCOUNT_PASSWORD ต้องยาวอย่างน้อย 12 ตัวอักษร');
    return fromEnv;
  }
  return randomBytes(12).toString('base64url');
})();
const TEST_PASSWORD_FROM_ENV = !!process.env.TEST_ACCOUNT_PASSWORD;

const ROLE_USERNAME: Record<Role, string> = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin_test',
  MANAGER: 'manager_test',
  DIRECTOR: 'director_test',
  EMPLOYEE: 'employee_test',
  HR: 'hr_test',
};

const ROLE_NAME: Record<Role, string> = {
  SUPER_ADMIN: 'ทดสอบ ผู้ดูแลระบบสูงสุด',
  ADMIN: 'ทดสอบ ผู้ดูแลระบบ',
  MANAGER: 'ทดสอบ ผู้จัดการ',
  DIRECTOR: 'ทดสอบ ผู้อำนวยการ',
  EMPLOYEE: 'ทดสอบ พนักงาน',
  HR: 'ทดสอบ ฝ่ายบุคคล',
};

// ============================================
// คลังข้อมูล dummy (หมุนวนตามลำดับแถว ไม่ต้องพึ่ง library ภายนอก)
// ============================================
const DUMMY_PEOPLE = ['ทดสอบ หนึ่ง', 'ทดสอบ สอง', 'ทดสอบ สาม', 'ทดสอบ สี่', 'ทดสอบ ห้า', 'ทดสอบ หก'];
const DUMMY_VENDORS = ['ร้านทดสอบ เอ', 'ร้านทดสอบ บี', 'ร้านทดสอบ ซี', 'บริษัททดสอบ จำกัด'];
const DUMMY_REASONS = ['ลาเพื่อทดสอบระบบ (ข้อมูลจำลอง)', 'เหตุผลทดสอบ ไม่ใช่ข้อมูลจริง'];
const DUMMY_ADDRESS = ['ที่อยู่ทดสอบ 111 ถ.ทดสอบ ต.ทดสอบ อ.ทดสอบ (ข้อมูลจำลอง)'];
const DUMMY_TASK_TITLE = ['งานทดสอบระบบ 1', 'งานทดสอบระบบ 2', 'งานทดสอบระบบ 3'];
const DUMMY_TASK_DESC = ['รายละเอียดงานทดสอบ (ข้อมูลจำลอง ไม่ใช่ข้อมูลจริง)'];
const DUMMY_SUBJECT = ['เรื่องทดสอบระบบ (ข้อมูลจำลอง)'];
const DUMMY_NOTE = ['หมายเหตุทดสอบ (ข้อมูลจำลอง)'];
const DUMMY_IP = ['203.0.113.1', '203.0.113.2', '203.0.113.3']; // TEST-NET-3 (RFC 5737) เจตนาไม่ใช่ IP จริง
const DUMMY_USER_AGENT = 'Mozilla/5.0 (Test Data) TestAgent/1.0';

/** คืนค่า dummy จาก pool ถ้า original ไม่ใช่ null/undefined (คงรูปร่างเดิม ไม่เติมค่าที่ไม่เคยมี) */
function dummyOrKeep(original: string | null | undefined, pool: string[], idx: number): string | null {
  if (original === null || original === undefined) return null;
  return pool[idx % pool.length];
}

async function main() {
  const dbRow = await prisma.$queryRaw<{ db: string }[]>`SELECT DATABASE() as db`;
  const dbName = dbRow[0]?.db;
  console.log(`เชื่อมต่อฐานข้อมูล: ${dbName}`);

  if (dbName === FORBIDDEN_DB_NAME) {
    console.error(`❌ หยุดทันที: ห้ามรันสคริปต์นี้กับฐานข้อมูลจริง (${FORBIDDEN_DB_NAME})`);
    process.exit(1);
  }

  const allUsers = await prisma.user.findMany({
    select: { id: true, username: true, role: true },
    orderBy: { id: 'asc' },
  });

  // เลือกผู้ใช้ที่จะเก็บไว้ 1 คนต่อ role (id น้อยสุดของแต่ละ role)
  const keptIdByRole = {} as Record<Role, number>;
  for (const role of Object.values(Role)) {
    const existing = allUsers.find((u) => u.role === role);
    if (existing) keptIdByRole[role] = existing.id;
  }
  const rolesNeedingCreate = Object.values(Role).filter((r) => !(r in keptIdByRole));

  console.log('\nผู้ใช้ที่จะเก็บไว้ (1 ต่อ role):');
  for (const role of Object.values(Role)) {
    const status = role in keptIdByRole ? `id=${keptIdByRole[role]}` : '(ยังไม่มี — จะสร้างใหม่)';
    console.log(`  ${role} -> ${ROLE_USERNAME[role]}  ${status}`);
  }

  const keptIdsSoFar = new Set(Object.values(keptIdByRole));
  const deletedUsers = allUsers.filter((u) => !keptIdsSoFar.has(u.id));
  console.log(`\nผู้ใช้ที่จะลบ: ${deletedUsers.length} คน จากทั้งหมด ${allUsers.length} คน`);

  const [supplyCount, txCount, assetCount, checkoutCount, docCount, loginAttemptCount, sessionCount, leaveCount, taskCount] =
    await Promise.all([
      prisma.supply.count(),
      prisma.supplyTransaction.count(),
      prisma.asset.count(),
      prisma.assetCheckout.count(),
      prisma.documentRegister.count(),
      prisma.loginAttempt.count(),
      prisma.session.count(),
      prisma.leave.count(),
      prisma.task.count(),
    ]);
  console.log('\nจำนวนแถวที่จะ scrub (คงจำนวนเดิมไว้):');
  console.log(
    `  Supply=${supplyCount} SupplyTransaction=${txCount} Asset=${assetCount} AssetCheckout=${checkoutCount} ` +
      `DocumentRegister=${docCount} LoginAttempt=${loginAttemptCount} Session=${sessionCount}`
  );
  console.log(`  Leave=${leaveCount} Task=${taskCount} (จะลดลงเหลือเฉพาะของผู้ใช้ที่เก็บไว้ หลังลบผู้ใช้ที่เหลือ)`);

  if (!YES) {
    console.log('\n(dry-run — ไม่มีการเขียนข้อมูลใดๆ ใส่ --yes เพื่อรันจริง)');
    return;
  }

  // ============================================
  // Phase 1: สร้างผู้ใช้สำหรับ role ที่ยังไม่มี
  // ============================================
  console.log('\n[1/5] สร้างผู้ใช้สำหรับ role ที่ยังไม่มี...');
  const hashedTestPassword = await hashPassword(TEST_PASSWORD);
  for (const role of rolesNeedingCreate) {
    const username = ROLE_USERNAME[role];
    const name = ROLE_NAME[role];
    const created = await prisma.user.create({
      data: {
        username,
        email: `${username}@test.local`,
        password: hashedTestPassword,
        name,
        role,
        avatar: generateAvatarInitials(name),
        isActive: true,
      },
    });
    keptIdByRole[role] = created.id;
    console.log(`  สร้าง ${role} -> ${username} (id=${created.id})`);
  }

  const keptIds = new Set(Object.values(keptIdByRole));
  const keptSuperAdminId = keptIdByRole.SUPER_ADMIN;
  const deletedIds = allUsers.filter((u) => !keptIds.has(u.id)).map((u) => u.id);

  // ============================================
  // Phase 2: ย้าย FK ที่ห้ามค้าง (Restrict) และที่ไม่มี relation ไปที่ super admin ที่เก็บไว้
  // ============================================
  console.log('\n[2/5] ย้าย FK ของผู้ใช้ที่จะลบ ไปที่ super admin ที่เก็บไว้...');
  if (deletedIds.length > 0) {
    await prisma.supplyTransaction.updateMany({
      where: { performedById: { in: deletedIds } },
      data: { performedById: keptSuperAdminId },
    });
    await prisma.assetCheckout.updateMany({
      where: { holderId: { in: deletedIds } },
      data: { holderId: keptSuperAdminId },
    });
    await prisma.assetCheckout.updateMany({
      where: { issuedById: { in: deletedIds } },
      data: { issuedById: keptSuperAdminId },
    });
    await prisma.documentRegister.updateMany({
      where: { recordedById: { in: deletedIds } },
      data: { recordedById: keptSuperAdminId },
    });
    await prisma.formRequest.updateMany({
      where: { requestedById: { in: deletedIds } },
      data: { requestedById: keptSuperAdminId },
    });
    // คอลัมน์ที่ไม่มี FK constraint จริง (แค่ Int เฉยๆ) — ย้ายเพื่อความสะอาด ไม่จำเป็นต่อการลบให้สำเร็จ
    await prisma.leave.updateMany({
      where: { approvedBy: { in: deletedIds } },
      data: { approvedBy: keptSuperAdminId },
    });
    await prisma.formRequest.updateMany({
      where: { approvedBy: { in: deletedIds } },
      data: { approvedBy: keptSuperAdminId },
    });
    await prisma.uploadedFile.updateMany({
      where: { uploadedById: { in: deletedIds } },
      data: { uploadedById: keptSuperAdminId },
    });
  }
  // สถานะ challenge ชั่วคราว (2FA/passkey ที่กำลังรอยืนยัน) ไม่มีความหมายอะไรแล้ว ลบทิ้งทั้งหมด
  await prisma.webAuthnChallenge.deleteMany({});
  await prisma.twoFactorChallenge.deleteMany({});

  // ============================================
  // Phase 3: ลบผู้ใช้ที่เหลือ (cascade จัดการ session/leave/2FA/passkey ของคนนั้นให้อัตโนมัติ)
  // ============================================
  console.log(`\n[3/5] ลบผู้ใช้ ${deletedIds.length} คน...`);
  if (deletedIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: deletedIds } } });
  }

  // ============================================
  // Phase 4: แทนที่ข้อมูลส่วนตัวของผู้ใช้ที่เก็บไว้ทั้ง 6 คน
  // ============================================
  console.log('\n[4/5] แทนที่ข้อมูลส่วนตัวของผู้ใช้ที่เก็บไว้...');
  for (const role of Object.values(Role)) {
    const id = keptIdByRole[role];
    const username = ROLE_USERNAME[role];
    const name = ROLE_NAME[role];
    await prisma.user.update({
      where: { id },
      data: {
        username,
        name,
        prefix: null,
        email: `${username}@test.local`,
        phone: '000-0000000',
        address: null,
        birthday: null,
        avatar: generateAvatarInitials(name),
        profileImage: null,
        password: hashedTestPassword,
        twoFactorEnabled: false,
        twoFactorSecret: null,
      },
    });
    await prisma.twoFactorBackupCode.deleteMany({ where: { userId: id } });
    await prisma.authenticator.deleteMany({ where: { userId: id } });
    console.log(`  ${role} -> ${username}`);
  }

  // ============================================
  // Phase 5: scrub ข้อมูลที่เหลือ (คงจำนวนแถวเดิมไว้)
  // ============================================
  console.log('\n[5/5] แทนที่ข้อมูลจริงในตารางอื่นๆ ด้วย dummy...');

  const leaves = await prisma.leave.findMany({ select: { id: true, reason: true, contactAddress: true } });
  for (let i = 0; i < leaves.length; i++) {
    const l = leaves[i];
    await prisma.leave.update({
      where: { id: l.id },
      data: {
        reason: DUMMY_REASONS[i % DUMMY_REASONS.length],
        contactAddress: dummyOrKeep(l.contactAddress, DUMMY_ADDRESS, i),
      },
    });
  }
  console.log(`  Leave: ${leaves.length} แถว`);

  const tasks = await prisma.task.findMany({ select: { id: true, description: true } });
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    await prisma.task.update({
      where: { id: t.id },
      data: {
        title: DUMMY_TASK_TITLE[i % DUMMY_TASK_TITLE.length],
        description: dummyOrKeep(t.description, DUMMY_TASK_DESC, i),
      },
    });
  }
  console.log(`  Task: ${tasks.length} แถว`);

  const supplies = await prisma.supply.findMany({ select: { id: true, recorderName: true, supplier: true, notes: true } });
  for (let i = 0; i < supplies.length; i++) {
    const s = supplies[i];
    await prisma.supply.update({
      where: { id: s.id },
      data: {
        recorderName: dummyOrKeep(s.recorderName, DUMMY_PEOPLE, i),
        supplier: dummyOrKeep(s.supplier, DUMMY_VENDORS, i),
        notes: dummyOrKeep(s.notes, DUMMY_NOTE, i),
      },
    });
  }
  console.log(`  Supply: ${supplies.length} แถว`);

  const txs = await prisma.supplyTransaction.findMany({
    select: { id: true, recipientName: true, returnerName: true, returnReceiverName: true, adjusterName: true, notes: true },
  });
  for (let i = 0; i < txs.length; i++) {
    const t = txs[i];
    await prisma.supplyTransaction.update({
      where: { id: t.id },
      data: {
        recipientName: dummyOrKeep(t.recipientName, DUMMY_PEOPLE, i),
        returnerName: dummyOrKeep(t.returnerName, DUMMY_PEOPLE, i + 1),
        returnReceiverName: dummyOrKeep(t.returnReceiverName, DUMMY_PEOPLE, i + 2),
        adjusterName: dummyOrKeep(t.adjusterName, DUMMY_PEOPLE, i + 3),
        notes: dummyOrKeep(t.notes, DUMMY_NOTE, i),
      },
    });
  }
  console.log(`  SupplyTransaction: ${txs.length} แถว`);

  const assets = await prisma.asset.findMany({ select: { id: true, receiverName: true, lastInspectedBy: true, notes: true } });
  for (let i = 0; i < assets.length; i++) {
    const a = assets[i];
    await prisma.asset.update({
      where: { id: a.id },
      data: {
        receiverName: dummyOrKeep(a.receiverName, DUMMY_PEOPLE, i),
        lastInspectedBy: dummyOrKeep(a.lastInspectedBy, DUMMY_PEOPLE, i + 1),
        notes: dummyOrKeep(a.notes, DUMMY_NOTE, i),
      },
    });
  }
  console.log(`  Asset: ${assets.length} แถว`);

  const checkouts = await prisma.assetCheckout.findMany({ select: { id: true, notes: true } });
  for (let i = 0; i < checkouts.length; i++) {
    const c = checkouts[i];
    await prisma.assetCheckout.update({
      where: { id: c.id },
      data: { notes: dummyOrKeep(c.notes, DUMMY_NOTE, i) },
    });
  }
  console.log(`  AssetCheckout: ${checkouts.length} แถว`);

  const docs = await prisma.documentRegister.findMany({
    select: { id: true, subject: true, recipientName: true, senderName: true, remarks: true },
  });
  for (let i = 0; i < docs.length; i++) {
    const d = docs[i];
    await prisma.documentRegister.update({
      where: { id: d.id },
      data: {
        subject: DUMMY_SUBJECT[i % DUMMY_SUBJECT.length],
        recipientName: dummyOrKeep(d.recipientName, DUMMY_PEOPLE, i),
        senderName: dummyOrKeep(d.senderName, DUMMY_PEOPLE, i + 1),
        remarks: dummyOrKeep(d.remarks, DUMMY_NOTE, i),
      },
    });
  }
  console.log(`  DocumentRegister: ${docs.length} แถว`);

  const files = await prisma.uploadedFile.findMany({ select: { id: true } });
  for (let i = 0; i < files.length; i++) {
    await prisma.uploadedFile.update({
      where: { id: files[i].id },
      data: { fileName: `dummy-file-${i + 1}.bin`, data: Buffer.from('dummy') },
    });
  }
  console.log(`  UploadedFile: ${files.length} แถว`);

  const attempts = await prisma.loginAttempt.findMany({ select: { id: true } });
  for (let i = 0; i < attempts.length; i++) {
    await prisma.loginAttempt.update({
      where: { id: attempts[i].id },
      data: { username: `dummy_user_${i % 10}`, ipAddress: DUMMY_IP[i % DUMMY_IP.length] },
    });
  }
  console.log(`  LoginAttempt: ${attempts.length} แถว`);

  const sessions = await prisma.session.findMany({ select: { id: true } });
  for (let i = 0; i < sessions.length; i++) {
    await prisma.session.update({
      where: { id: sessions[i].id },
      data: { ipAddress: DUMMY_IP[i % DUMMY_IP.length], userAgent: DUMMY_USER_AGENT },
    });
  }
  console.log(`  Session: ${sessions.length} แถว`);

  console.log('\n✅ เสร็จสิ้น — ผู้ใช้สำหรับทดสอบ (รหัสผ่านเดียวกันทุกบัญชี):');
  console.log(TEST_PASSWORD_FROM_ENV ? '  รหัสผ่าน: ตามค่า TEST_ACCOUNT_PASSWORD' : `  รหัสผ่าน (สุ่มให้ แสดงครั้งเดียว): ${TEST_PASSWORD}`);
  for (const role of Object.values(Role)) {
    console.log(`  ${ROLE_USERNAME[role]}  (${role})`);
  }
}

main()
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
