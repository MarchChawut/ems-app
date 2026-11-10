/**
 * ==================================================
 * Seed Lib - ข้อมูลเริ่มต้นของระบบ (เรียกจาก prisma/seed.ts และจากเทส)
 * ==================================================
 * หลักการ: **สร้างบัญชีผู้ใช้น้อยที่สุด** — มี Super Admin เริ่มต้น 1 บัญชีเท่านั้น
 * พนักงานของแต่ละหน่วยงานเพิ่มเองผ่านหน้า "พนักงาน" (ทีละคนหรือนำเข้า CSV) จำนวนบัญชี = กำลังพลจริงของหน่วยงานนั้น
 * ไม่มีรายชื่อ/ข้อมูลส่วนบุคคล/รหัสผ่านตัวอย่างฝังในโค้ด
 *
 * ตัวแปร environment (ดู .env.example):
 *   SEED_ADMIN_USERNAME  ชื่อผู้ใช้ Super Admin (ค่าเริ่มต้น admin; ตัวอักษร/ตัวเลข . _ - ยาว 3-50)
 *   SEED_ADMIN_NAME      ชื่อที่แสดง (ค่าเริ่มต้น "ผู้ดูแลระบบ")
 *   SEED_ADMIN_EMAIL     อีเมล (ไม่ตั้ง = ไม่มีอีเมล)
 *   SEED_ADMIN_PASSWORD  รหัสผ่านเริ่มต้น ≥ 12 ตัวอักษร (ไม่ตั้ง = สุ่มให้และแสดงครั้งเดียว; production บังคับต้องตั้ง)
 *   SEED_ENABLE_ALL_FEATURES=true  เปิดทุกฟีเจอร์ในการติดตั้งใหม่ (เดโม/CI) — ปกติการติดตั้งใหม่เริ่มด้วยแท็บหลักเท่านั้น
 * บัญชีที่ seed สร้างต้องเปลี่ยนรหัสผ่านและลงทะเบียน passkey ตอนล็อกอินครั้งแรก และรหัสเริ่มต้นหมดอายุใน 7 วัน
 * seed รันซ้ำได้อย่างปลอดภัย: ไม่เขียนทับบัญชี/รหัสผ่าน/โปรไฟล์/การตั้งค่าที่มีอยู่แล้ว
 */

import { PrismaClient, Role } from '@prisma/client';
import { randomBytes } from 'crypto';
import { hashPassword, generateAvatarInitials } from '../src/lib/security';
import { VEHICLE_REQUEST_FIELDS, REMOVED_VEHICLE_FIELD_KEYS } from '../src/lib/vehicle-request';
import { initialSetupFlags } from '../src/lib/security-setup';
import { PERMISSIONS } from '../src/lib/permissions';
import { DEFAULT_ORG } from '../src/lib/org-settings';
import { FRESH_INSTALL_DISABLED_FEATURES } from '../src/lib/features';

export interface SeedResult {
  /** การติดตั้งใหม่ (ยังไม่มีผู้ใช้และไม่เคยตั้งค่าฟีเจอร์) */
  freshInstall: boolean;
  /** สร้างบัญชี Super Admin ใหม่ในรอบนี้หรือไม่ (มีอยู่แล้ว = ไม่แตะ) */
  adminCreated: boolean;
  adminUsername: string;
  /** รหัสผ่านที่สุ่มให้ (เฉพาะเมื่อสร้างบัญชีใหม่โดยไม่ได้ตั้ง SEED_ADMIN_PASSWORD) */
  generatedPassword: string | null;
}

const USERNAME_RE = /^[a-zA-Z0-9._-]{3,50}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * รหัสผ่านเริ่มต้นของ seed: ต้องมาจาก environment เท่านั้น ห้ามมีค่า fallback ที่ฝังในโค้ด
 * - production: ต้องตั้ง env และยาว ≥ 12 ตัวอักษร ไม่เช่นนั้นหยุดทันที
 * - dev: ถ้าไม่ตั้ง จะสุ่มรหัสให้และแสดงครั้งเดียวตอนจบ seed
 */
export function resolveSeedPassword(env: NodeJS.ProcessEnv, envName: string): { value: string; generated: boolean } {
  const fromEnv = env[envName];
  if (fromEnv) {
    if (fromEnv.length < 12) {
      throw new Error(`${envName} ต้องยาวอย่างน้อย 12 ตัวอักษร`);
    }
    return { value: fromEnv, generated: false };
  }
  if (env.NODE_ENV === 'production') {
    throw new Error(`ต้องตั้ง ${envName} (ยาว ≥ 12 ตัวอักษร) ก่อนรัน seed บน production`);
  }
  return { value: randomBytes(12).toString('base64url'), generated: true };
}

export async function runSeed(prisma: PrismaClient, env: NodeJS.ProcessEnv = process.env): Promise<SeedResult> {
  console.log('🌱 เริ่มต้น seed ข้อมูล...');

  // ตรวจค่าที่ผู้ติดตั้งตั้งไว้ก่อนแตะฐานข้อมูล (ผิดรูปแบบ = หยุดทันที ไม่เขียนอะไรเลย)
  const adminUsername = (env.SEED_ADMIN_USERNAME || 'admin').trim();
  if (!USERNAME_RE.test(adminUsername)) {
    throw new Error('SEED_ADMIN_USERNAME ต้องเป็นตัวอักษร/ตัวเลข . _ - ยาว 3-50 ตัวอักษร');
  }
  const adminName = (env.SEED_ADMIN_NAME || 'ผู้ดูแลระบบ').trim().slice(0, 100) || 'ผู้ดูแลระบบ';
  const adminEmail = env.SEED_ADMIN_EMAIL?.trim() || null;
  if (adminEmail && !EMAIL_RE.test(adminEmail)) {
    throw new Error('SEED_ADMIN_EMAIL รูปแบบอีเมลไม่ถูกต้อง');
  }

  // ============================================
  // ค่าเริ่มต้นของ "การติดตั้งใหม่": ยังไม่มีผู้ใช้และไม่เคยตั้งค่าฟีเจอร์ → ปิดฟีเจอร์เสริมทั้งหมด
  // ผู้ติดตั้งใหม่จึงเห็นแท็บเริ่มต้นแค่ หน้าหลัก/พนักงาน/ตั้งค่า (+ ข้อมูลส่วนตัวในเมนูโปรไฟล์) แล้ว Super Admin เปิดเพิ่มเอง
  // ระบบที่ใช้งานอยู่แล้ว (มีผู้ใช้) ไม่ถูกแตะ — ไม่มีแถว = เปิดทั้งหมดเหมือนเดิม; SEED_ENABLE_ALL_FEATURES=true = เปิดทั้งหมด (เดโม/CI)
  // ต้องตัดสินก่อนสร้างผู้ใช้ด้านล่าง
  // ============================================
  const isFreshInstall = (await prisma.user.count()) === 0 && (await prisma.featureSetting.count()) === 0;
  if (isFreshInstall && env.SEED_ENABLE_ALL_FEATURES !== 'true') {
    for (const featureKey of FRESH_INSTALL_DISABLED_FEATURES) {
      await prisma.featureSetting.create({ data: { featureKey, enabled: false } });
    }
    console.log(`🧩 ติดตั้งใหม่: ปิดฟีเจอร์เสริม ${FRESH_INSTALL_DISABLED_FEATURES.length} รายการ (เปิดเพิ่มได้ที่ ตั้งค่า > ฟีเจอร์ของระบบ โดย Super Admin)`);
  }

  // ============================================
  // ข้อมูลหน่วยงานหลัก (ชื่อสังกัด/ชื่อกอง) — สร้างเมื่อยังไม่มี และ "ไม่ทับ" ค่าที่แอดมินแก้ไว้ในหน้าตั้งค่า
  // ผู้ใช้ที่ seed ใช้ชื่อจากแถวนี้ (ไม่ใช่ค่าเริ่มต้นที่ฝังในโค้ด) เพื่อไม่ให้รอบถัดไปรีเซ็ตชื่อกลับ
  // ============================================
  const orgRow = await prisma.orgSetting.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, ...DEFAULT_ORG },
  });
  const org = { divisionName: orgRow.divisionName, departmentName: orgRow.departmentName };

  // ============================================
  // บัญชี Super Admin เริ่มต้น (บัญชีเดียวที่ seed สร้าง) — มีอยู่แล้วจะไม่แตะ ไม่เขียนทับรหัสผ่าน/โปรไฟล์
  // ============================================
  console.log('👤 ตรวจบัญชีผู้ดูแลระบบเริ่มต้น...');
  const existingAdmin = await prisma.user.findUnique({ where: { username: adminUsername }, select: { id: true } });
  let adminCreated = false;
  let generatedPassword: string | null = null;
  if (existingAdmin) {
    console.log(`ℹ️  มีผู้ใช้ "${adminUsername}" อยู่แล้ว — ไม่แก้ไข`);
  } else {
    const adminSeed = resolveSeedPassword(env, 'SEED_ADMIN_PASSWORD');
    await prisma.user.create({
      data: {
        username: adminUsername,
        email: adminEmail,
        password: await hashPassword(adminSeed.value),
        name: adminName,
        role: Role.SUPER_ADMIN,
        avatar: generateAvatarInitials(adminName),
        isActive: true,
        department: org.departmentName,
        division: org.divisionName,
        // ต้องเปลี่ยนรหัสผ่าน + ลงทะเบียน passkey ครั้งแรก และรหัสเริ่มต้นหมดอายุใน 7 วัน (กลไกบัญชีที่ผู้ดูแลตั้งรหัสให้)
        ...initialSetupFlags(),
      },
    });
    adminCreated = true;
    generatedPassword = adminSeed.generated ? adminSeed.value : null;
    console.log(`✅ สร้างบัญชี Super Admin: ${adminUsername}`);
  }

  // ============================================
  // สร้างคอลัมน์ Kanban เริ่มต้น
  // ============================================
  console.log('📊 กำลังสร้างคอลัมน์ Kanban...');

  const defaultColumns = [
    { name: 'รอดำเนินการ', color: 'slate', order: 0, isDefault: true },
    { name: 'กำลังทำ', color: 'blue', order: 1, isDefault: true },
    { name: 'เสร็จสิ้น', color: 'emerald', order: 2, isDefault: true },
  ];

  for (const colData of defaultColumns) {
    const column = await prisma.kanbanColumn.upsert({
      where: { id: colData.order + 1 },
      update: {},
      create: colData,
    });
    console.log('✅ สร้างคอลัมน์:', column.name);
  }

  // ============================================
  // สิทธิ์ default ตาม role (RolePermission)
  // ตั้งให้ตรงกับพฤติกรรมปัจจุบันของ isManagerOrAbove() ใน src/lib/auth.ts
  // ADMIN/SUPER_ADMIN ไม่ต้อง seed แถวใดๆ เพราะ hasPermission() ให้ผ่านเสมออยู่แล้ว (short-circuit)
  // ============================================
  console.log('🔐 กำลังตั้งค่าสิทธิ์เริ่มต้นตาม role...');

  const rolePermissionDefaults: { role: Role; permissionKey: string }[] = [
    { role: Role.MANAGER, permissionKey: PERMISSIONS.LEAVES_APPROVE },
    { role: Role.MANAGER, permissionKey: PERMISSIONS.FORMS_APPROVE },
    { role: Role.DIRECTOR, permissionKey: PERMISSIONS.LEAVES_APPROVE },
    { role: Role.DIRECTOR, permissionKey: PERMISSIONS.FORMS_APPROVE },
  ];

  for (const rp of rolePermissionDefaults) {
    await prisma.rolePermission.upsert({
      where: { role_permissionKey: { role: rp.role, permissionKey: rp.permissionKey } },
      update: {},
      create: rp,
    });
  }
  console.log('✅ ตั้งค่าสิทธิ์เริ่มต้นตาม role สำเร็จ');

  // ============================================
  // FormTemplate เริ่มต้น (migrate 4 แบบฟอร์มเดิมจาก src/components/forms/formTemplates.ts
  // ให้เป็น template ที่แก้ไขผ่าน admin UI ได้ - systemKey ผูกไว้เพื่อไม่ให้ลบทิ้งโดยไม่ตั้งใจ)
  // ============================================
  console.log('📄 กำลังสร้างแบบฟอร์มเริ่มต้น (FormTemplate)...');

  const legacyFormTemplates = [
    {
      systemKey: 'VEHICLE_REQUEST',
      menuTitle: 'ขอรถยนต์หลวง',
      documentTitle: 'ใบขอรับการสนับสนุนรถยนต์',
      // ฟิลด์ตามใบขอรับการสนับสนุนรถยนต์ (กองพระราชพาหนะ 904) — นิยามใน src/lib/vehicle-request.ts
      fields: VEHICLE_REQUEST_FIELDS.map((f, order) => ({ ...f, order })),
    },
    {
      systemKey: 'REFRESHMENT_REQUEST',
      menuTitle: 'ขอรับสนับสนุนอาหารว่าง',
      documentTitle: 'ขอรับการสนับสนุนอาหารว่างและเครื่องดื่ม',
      fields: [
        { key: 'eventName', label: 'ชื่องาน/กิจกรรม', inputType: 'text', required: true, order: 0 },
        { key: 'eventTime', label: 'เวลา', inputType: 'time', required: false, order: 1 },
        { key: 'venue', label: 'สถานที่', inputType: 'text', required: false, order: 2 },
        { key: 'participantCount', label: 'จำนวนผู้เข้าร่วม', inputType: 'number', required: false, order: 3 },
        { key: 'budgetSource', label: 'แหล่งงบประมาณ', inputType: 'text', required: false, order: 4 },
      ],
    },
    {
      systemKey: 'MEETING_ROOM_REQUEST',
      menuTitle: 'ขอใช้ห้องประชุม',
      documentTitle: 'ขอใช้ห้องประชุม',
      fields: [
        { key: 'roomName', label: 'ชื่อห้องประชุม', inputType: 'text', required: true, order: 0 },
        { key: 'startTime', label: 'เวลาเริ่ม', inputType: 'time', required: false, order: 1 },
        { key: 'endTime', label: 'เวลาสิ้นสุด', inputType: 'time', required: false, order: 2 },
        { key: 'purpose', label: 'วัตถุประสงค์', inputType: 'text', required: false, order: 3 },
        { key: 'participantCount', label: 'จำนวนผู้เข้าร่วม', inputType: 'number', required: false, order: 4 },
        { key: 'equipment', label: 'อุปกรณ์ที่ต้องการ', inputType: 'text', required: false, order: 5 },
      ],
    },
    {
      systemKey: 'SPEAKER_REQUEST',
      menuTitle: 'ขอความอนุเคราะห์วิทยากร',
      documentTitle: 'ขอความอนุเคราะห์วิทยากร',
      fields: [
        { key: 'eventName', label: 'ชื่อกิจกรรม', inputType: 'text', required: true, order: 0 },
        { key: 'eventTime', label: 'เวลา', inputType: 'time', required: false, order: 1 },
        { key: 'venue', label: 'สถานที่', inputType: 'text', required: false, order: 2 },
        { key: 'topic', label: 'หัวข้อบรรยาย', inputType: 'text', required: true, order: 3 },
        { key: 'speakerName', label: 'ชื่อวิทยากร (ถ้ามี)', inputType: 'text', required: false, order: 4 },
        { key: 'participantCount', label: 'จำนวนผู้เข้าร่วม', inputType: 'number', required: false, order: 5 },
      ],
    },
  ];

  for (let i = 0; i < legacyFormTemplates.length; i++) {
    const { fields, ...templateData } = legacyFormTemplates[i];
    const template = await prisma.formTemplate.upsert({
      where: { systemKey: templateData.systemKey },
      update: { menuTitle: templateData.menuTitle, documentTitle: templateData.documentTitle, order: i },
      create: { ...templateData, order: i },
    });

    for (const field of fields) {
      await prisma.formTemplateField.upsert({
        where: { templateId_key: { templateId: template.id, key: field.key } },
        update: {
          label: field.label,
          inputType: field.inputType,
          required: field.required,
          order: field.order,
          // options เขียนเฉพาะฟิลด์ที่ seed กำหนดไว้ (เช่น ประเภทรถ) — ฟิลด์อื่นไม่แตะค่าที่แอดมินแก้ไว้
          ...('options' in field && field.options ? { options: field.options } : {}),
        },
        create: { ...field, templateId: template.id },
      });
    }
    if (template.systemKey === 'VEHICLE_REQUEST') {
      // ฟิลด์ที่เอาออกจากใบขอรถยนต์แล้ว — seed ไม่ลบฟิลด์เอง จึงสั่งลบที่นี่ (ค่าในคำขอเก่าไม่ถูกแตะ)
      await prisma.formTemplateField.deleteMany({
        where: { templateId: template.id, key: { in: REMOVED_VEHICLE_FIELD_KEYS } },
      });
    }
    console.log('✅ สร้างแบบฟอร์มเริ่มต้น:', template.menuTitle);
  }

  console.log('✨ Seed ข้อมูลเสร็จสมบูรณ์!');
  if (adminCreated) {
    console.log('');
    console.log('🔑 บัญชีผู้ดูแลระบบเริ่มต้น (ต้องเปลี่ยนรหัสผ่านและตั้ง passkey ตอนล็อกอินครั้งแรก):');
    console.log(`   Username: ${adminUsername}`);
    // ไม่พิมพ์รหัสผ่านที่มาจาก env (อาจถูกเก็บใน log ของ CI/terminal); พิมพ์เฉพาะรหัสที่สุ่มให้ครั้งเดียว
    if (generatedPassword) {
      console.log('   Password (สุ่มให้ แสดงครั้งเดียว):', generatedPassword);
    } else {
      console.log('   Password: ตามค่า SEED_ADMIN_PASSWORD');
    }
  }
  console.log('👥 พนักงานอื่นเพิ่มได้ที่หน้า "พนักงาน" (ทีละคนหรือนำเข้า CSV)');

  return { freshInstall: isFreshInstall, adminCreated, adminUsername, generatedPassword };
}
