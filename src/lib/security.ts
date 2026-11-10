/**
 * ==================================================
 * Security Utilities - เครื่องมือความปลอดภัย
 * ==================================================
 * ไฟล์นี้รวมฟังก์ชันสำหรับการเข้ารหัส การตรวจสอบ
 * และการป้องกันภัยคุกคามต่างๆ
 */

import bcrypt from 'bcryptjs';
import { z } from 'zod';

// ============================================
// การตั้งค่าความปลอดภัย
// ============================================
const SALT_ROUNDS = 12; // จำนวนรอบการเข้ารหัส bcrypt
const MAX_LOGIN_ATTEMPTS = 5; // จำนวนครั้งสูงสุดที่อนุญาตให้เข้าสู่ระบบผิดพลาด
const LOCKOUT_DURATION = 30 * 60 * 1000; // ระยะเวลาบล็อก (30 นาทีเป็นมิลลิวินาที)

// ============================================
// ฟังก์ชันการเข้ารหัสรหัสผ่าน
// ============================================

/**
 * เข้ารหัสรหัสผ่านด้วย bcrypt
 * @param password - รหัสผ่านที่ต้องการเข้ารหัส
 * @returns {Promise<string>} รหัสผ่านที่เข้ารหัสแล้ว
 * 
 * ตัวอย่างการใช้งาน:
 * const hashedPassword = await hashPassword('myPassword123');
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

let dummyHashPromise: Promise<string> | null = null;

/**
 * hash หลอกที่ใช้เทียบรหัสผ่านเมื่อ "ไม่พบผู้ใช้" — ให้ login ใช้เวลา bcrypt เท่ากันทั้งกรณีมี/ไม่มี username
 * (ไม่เช่นนั้นเวลาตอบสนองที่ต่างกันบอกได้ว่า username ไหนมีอยู่จริง = user enumeration ผ่าน timing)
 */
export function getDummyPasswordHash(): Promise<string> {
  if (!dummyHashPromise) {
    dummyHashPromise = bcrypt.hash(`dummy-${Math.random()}-${Date.now()}`, SALT_ROUNDS);
  }
  return dummyHashPromise;
}

/**
 * ตรวจสอบรหัสผ่านกับ hash
 * @param password - รหัสผ่านที่ผู้ใช้ป้อน
 * @param hashedPassword - hash ที่เก็บในฐานข้อมูล
 * @returns {Promise<boolean>} true หากรหัสผ่านถูกต้อง
 * 
 * ตัวอย่างการใช้งาน:
 * const isValid = await verifyPassword('myPassword123', storedHash);
 */
export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

// ============================================
// การตรวจสอบข้อมูลด้วย Zod Schema
// ============================================

/**
 * Schema สำหรับตรวจสอบการเข้าสู่ระบบ
 */
export const loginSchema = z.object({
  username: z
    .string()
    .min(3, 'ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัวอักษร')
    .max(100, 'ชื่อผู้ใช้ต้องไม่เกิน 100 ตัวอักษร')
    .regex(/^[a-zA-Z0-9_]+$/, 'ชื่อผู้ใช้ต้องประกอบด้วยตัวอักษร ตัวเลข หรือ underscore เท่านั้น'),
  password: z
    .string()
    .min(8, 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร')
    .max(128, 'รหัสผ่านต้องไม่เกิน 128 ตัวอักษร'),
});

/**
 * Schema สำหรับเริ่ม flow เข้าสู่ระบบด้วย passkey (ระบุเฉพาะ username)
 */
export const passkeyLoginSchema = z.object({
  username: z
    .string()
    .min(3, 'ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัวอักษร')
    .max(100, 'ชื่อผู้ใช้ต้องไม่เกิน 100 ตัวอักษร')
    .regex(/^[a-zA-Z0-9_]+$/, 'ชื่อผู้ใช้ต้องประกอบด้วยตัวอักษร ตัวเลข หรือ underscore เท่านั้น'),
});

/**
 * กฎความซับซ้อนของรหัสผ่าน ใช้ร่วมกันทุกจุดที่ตั้ง/เปลี่ยนรหัสผ่าน
 * (สร้างผู้ใช้ใหม่, เปลี่ยนรหัสผ่านตนเอง, super admin รีเซ็ตรหัสผ่านให้ผู้อื่น)
 */
export const passwordComplexitySchema = z
  .string()
  .min(8, 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร')
  .max(128, 'รหัสผ่านต้องไม่เกิน 128 ตัวอักษร')
  .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'รหัสผ่านต้องมีตัวพิมพ์เล็ก ตัวพิมพ์ใหญ่ และตัวเลข');

/**
 * Schema สำหรับตรวจสอบการสร้างผู้ใช้ใหม่
 */
export const createUserSchema = z.object({
  email: z
    .string()
    .email('รูปแบบอีเมลไม่ถูกต้อง')
    .max(255, 'อีเมลต้องไม่เกิน 255 ตัวอักษร'),
  username: z
    .string()
    .min(3, 'ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัวอักษร')
    .max(100, 'ชื่อผู้ใช้ต้องไม่เกิน 100 ตัวอักษร')
    .regex(/^[a-zA-Z0-9_]+$/, 'ชื่อผู้ใช้ต้องประกอบด้วยตัวอักษร ตัวเลข หรือ underscore เท่านั้น'),
  password: passwordComplexitySchema,
  prefix: z.string().max(50).nullable().optional(),
  name: z
    .string()
    .min(1, 'กรุณาระบุชื่อ')
    .max(100, 'ชื่อต้องไม่เกิน 100 ตัวอักษร'),
  role: z.enum(['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'DIRECTOR', 'EMPLOYEE', 'HR']),
  department: z.string().max(100).optional(),
  supervisorId: z.number().int().positive().nullable().optional(),
});

/**
 * Schema สำหรับตรวจสอบการเปลี่ยนรหัสผ่านด้วยตนเอง (ต้องยืนยันรหัสเดิมก่อน)
 */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'กรุณากรอกรหัสผ่านเดิม'),
  newPassword: passwordComplexitySchema,
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'รหัสผ่านใหม่และการยืนยันไม่ตรงกัน',
  path: ['confirmPassword'],
});

/**
 * Schema สำหรับ super admin รีเซ็ตรหัสผ่านให้ผู้ใช้คนอื่น (ไม่ต้องยืนยันรหัสเดิม)
 */
export const resetPasswordSchema = z.object({
  password: passwordComplexitySchema,
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'รหัสผ่านใหม่และการยืนยันไม่ตรงกัน',
  path: ['confirmPassword'],
});

/**
 * Schema สำหรับตรวจสอบการสร้างงานใหม่
 */
export const createTaskSchema = z.object({
  title: z
    .string()
    .min(1, 'กรุณาระบุชื่องาน')
    .max(255, 'ชื่องานต้องไม่เกิน 255 ตัวอักษร'),
  description: z.string().max(1000).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
  columnId: z.number().int().positive().optional(),
  assigneeId: z.number().int().positive().optional(),
  reminderAt: z.string().optional().nullable(),
});

/**
 * Schema สำหรับตรวจสอบการสร้างรายการลา
 */
export const createLeaveSchema = z.object({
  type: z.enum(['SICK', 'PERSONAL', 'MATERNITY', 'ORDINATION', 'EARLY_LEAVE', 'LATE_ARRIVAL', 'RUN_AN_ERRAND', 'OTHER']),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'รูปแบบวันที่ต้องเป็น YYYY-MM-DD'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'รูปแบบวันที่ต้องเป็น YYYY-MM-DD'),
  reason: z
    .string()
    .min(1, 'กรุณาระบุเหตุผล')
    .max(500, 'เหตุผลต้องไม่เกิน 500 ตัวอักษร'),
  isHalfDay: z.boolean().optional(),
  hours: z.number().min(0).max(24).optional(),
  outTime: z.string().regex(/^\d{2}:\d{2}$/, 'รูปแบบเวลาต้องเป็น HH:mm').optional(),
  backTime: z.string().regex(/^\d{2}:\d{2}$/, 'รูปแบบเวลาต้องเป็น HH:mm').optional(),
  formCategory: z.enum(['KBK', 'STATS']).nullable().optional(),
  contactAddress: z.string().max(500, 'สถานที่พักต้องไม่เกิน 500 ตัวอักษร').optional(),
}).refine((data) => {
  const start = new Date(data.startDate);
  const end = new Date(data.endDate);
  return end >= start;
}, {
  message: 'วันที่สิ้นสุดต้องไม่น้อยกว่าวันที่เริ่มต้น',
  path: ['endDate'],
}).refine((data) => !(data.type === 'ORDINATION' && data.hours && data.hours > 0), {
  // ลาบวชลาได้เฉพาะเต็มวันหรือครึ่งวัน ไม่มีการลารายชั่วโมง
  message: 'ลาบวชลาได้เฉพาะเต็มวันหรือครึ่งวัน (ไม่มีรายชั่วโมง)',
  path: ['hours'],
});

/**
 * Schema ตำแหน่ง/ขนาดลายเซ็นผู้ลาบนแบบฟอร์ม (หน่วย mm) — null = ซ่อนลายเซ็น
 * x,y = ระยะเลื่อนจากจุดกึ่งกลางเส้นลงชื่อ, width = ความกว้างรูป
 */
export const signaturePlacementSchema = z
  .object({
    x: z.number().min(-80).max(80),
    y: z.number().min(-60).max(60),
    width: z.number().min(10).max(120),
  })
  .nullable();

/**
 * Schema ตารางเวรประจำกอง (RosterAssignment)
 * create: มอบงานเดียวกันให้หลายคนได้ (userIds) — เซิร์ฟเวอร์สร้างหนึ่งแถวต่อคน
 * update: แก้ไขทีละแถว (ไม่รับ userIds)
 */
const rosterCategoryEnum = z.enum(['DUTY', 'OFFICIAL_TRIP', 'MEETING', 'TRAINING', 'EVENT', 'OTHER']);
const rosterTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'รูปแบบเวลาต้องเป็น HH:mm');
const rosterDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'รูปแบบวันที่ต้องเป็น YYYY-MM-DD');

const rosterFields = {
  title: z.string().trim().min(1, 'กรุณาระบุชื่องาน').max(255, 'ชื่องานต้องไม่เกิน 255 ตัวอักษร'),
  category: rosterCategoryEnum,
  location: z.string().trim().max(255, 'สถานที่ต้องไม่เกิน 255 ตัวอักษร').nullish(),
  startDate: rosterDate,
  endDate: rosterDate,
  startTime: rosterTime.nullish(),
  endTime: rosterTime.nullish(),
  note: z.string().trim().max(1000, 'หมายเหตุต้องไม่เกิน 1000 ตัวอักษร').nullish(),
};

const rosterDateOrder = {
  check: (d: { startDate: string; endDate: string }) => new Date(d.endDate) >= new Date(d.startDate),
  opts: { message: 'วันที่สิ้นสุดต้องไม่น้อยกว่าวันที่เริ่มต้น', path: ['endDate'] as string[] },
};

export const createRosterSchema = z
  .object({
    ...rosterFields,
    userIds: z.array(z.number().int().positive()).min(1, 'กรุณาเลือกผู้ปฏิบัติงานอย่างน้อย 1 คน').max(200),
  })
  .refine(rosterDateOrder.check, rosterDateOrder.opts);

export const updateRosterSchema = z
  .object({
    ...rosterFields,
    /** ย้ายงานนี้ไปให้คนอื่น (ไม่ระบุ = คนเดิม) */
    userId: z.number().int().positive().optional(),
  })
  .refine(rosterDateOrder.check, rosterDateOrder.opts);

/**
 * Schema สำหรับตรวจสอบการสร้าง/อัปเดตหมวดหมู่พัสดุ
 */
export const createSupplyCategorySchema = z.object({
  name: z.string().min(1, 'กรุณาระบุชื่อหมวดหมู่').max(100, 'ชื่อหมวดหมู่ต้องไม่เกิน 100 ตัวอักษร'),
  description: z.string().max(255).optional().nullable(),
  order: z.number().int().min(0).optional(),
});

/**
 * Schema สำหรับตรวจสอบการสร้าง/อัปเดตพัสดุ
 */
export const createSupplySchema = z.object({
  name: z.string().min(1, 'กรุณาระบุชื่อพัสดุ').max(200, 'ชื่อพัสดุต้องไม่เกิน 200 ตัวอักษร'),
  type: z.enum(['STOCK', 'NON_STOCK']),
  categoryId: z.number().int().positive().optional().nullable(),
  supplyCode: z.string().max(100).optional().nullable(),
  unit: z.string().max(50).optional().nullable(),
  minimumQuantity: z.number().int().min(0).optional(),
  maximumQuantity: z.number().int().min(0).optional(),
  currentQuantity: z.number().int().min(0).optional(),
  thresholdRed: z.number().int().min(1).max(99).optional(),
  thresholdYellow: z.number().int().min(1).max(99).optional(),
  supplier: z.string().max(200).optional().nullable(),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  recorderName: z.string().max(200).optional().nullable(),
  unitPrice: z.number().min(0).optional().nullable(),
  documentNumber: z.string().max(100).optional().nullable(),
  documentUrl: z.string().max(500).optional().nullable(),
  imageUrl: z.string().max(500).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

/**
 * Schema สำหรับตรวจสอบการสร้างรายการเคลื่อนไหวพัสดุ
 */
export const createTransactionSchema = z.object({
  supplyId: z.number().int().positive('กรุณาระบุพัสดุ'),
  type: z.enum(['RECEIVE', 'ISSUE', 'RETURN', 'ADJUST']),
  quantity: z.number().int().positive('จำนวนต้องมากกว่า 0'),
  documentNumber: z.string().max(100).optional().nullable(),
  documentUrl: z.string().max(500).optional().nullable(),
  recipientName: z.string().max(200).optional().nullable(),
  returnerName: z.string().max(200).optional().nullable(),
  returnReceiverName: z.string().max(200).optional().nullable(),
  adjusterName: z.string().max(200).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

/**
 * Schema สำหรับตรวจสอบการสร้าง/อัปเดตหมวดหมู่ครุภัณฑ์
 */
export const createAssetCategorySchema = z.object({
  name: z.string().min(1, 'กรุณาระบุชื่อหมวดหมู่').max(100, 'ชื่อหมวดหมู่ต้องไม่เกิน 100 ตัวอักษร'),
  description: z.string().max(255).optional().nullable(),
  order: z.number().int().min(0).optional(),
});

/**
 * Schema สำหรับตรวจสอบการสร้าง/อัปเดตครุภัณฑ์
 */
export const createAssetSchema = z.object({
  name: z.string().min(1, 'กรุณาระบุชื่อครุภัณฑ์').max(200, 'ชื่อครุภัณฑ์ต้องไม่เกิน 200 ตัวอักษร'),
  assetTag: z.string().max(50).optional().nullable(),
  serialNumber: z.string().max(100).optional().nullable(),
  model: z.string().max(100).optional().nullable(),
  brand: z.string().max(100).optional().nullable(),
  categoryId: z.number().int().positive().optional().nullable(),
  status: z.enum(['AVAILABLE', 'IN_USE', 'IN_REPAIR', 'RETURNED', 'DISPOSED']).optional(),
  condition: z.enum(['EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'DAMAGED']).optional(),
  acquisitionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  acquisitionCost: z.number().min(0).optional().nullable(),
  documentNumber: z.string().max(100).optional().nullable(),
  documentUrl: z.string().max(500).optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  department: z.string().max(100).optional().nullable(),
  imageUrl: z.string().max(500).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  receiverName: z.string().max(200).optional().nullable(),
  lastInspectionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  lastInspectionCondition: z.enum(['EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'DAMAGED']).optional().nullable(),
  lastInspectedBy: z.string().max(200).optional().nullable(),
});

/**
 * Schema สำหรับตรวจสอบการยืมครุภัณฑ์
 */
export const createCheckoutSchema = z.object({
  assetId: z.number().int().positive('กรุณาระบุครุภัณฑ์'),
  holderId: z.number().int().positive('กรุณาระบุผู้ยืม'),
  issuedById: z.number().int().positive().optional().nullable(),
  expectedReturnAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

/**
 * Schema สำหรับตรวจสอบการสร้าง/อัปเดตทะเบียนรับ-ส่งเอกสาร
 */
export const createDocumentRegisterSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'กรุณาระบุวันที่ให้ถูกต้อง'),
  subject: z.string().min(1, 'กรุณาระบุเรื่อง').max(500, 'เรื่องต้องไม่เกิน 500 ตัวอักษร'),
  direction: z.enum(['RECEIVE', 'SEND']),
  category: z.enum(['MEMO', 'EXTERNAL_LETTER', 'PW_NEWS', 'VEHICLE_SUPPORT_REQUEST', 'REFRESHMENT_SUPPORT_REQUEST']),
  documentNumber: z.string().max(100).optional().nullable(),
  recipientName: z.string().max(200).optional().nullable(),
  senderName: z.string().max(200).optional().nullable(),
  remarks: z.string().max(2000).optional().nullable(),
});


// ============================================
// การป้องกัน Brute Force
// ============================================

// เก็บข้อมูลการพยายามเข้าสู่ระบบใน memory (ควรใช้ Redis ใน production)
const loginAttempts = new Map<string, { count: number; lastAttempt: number }>();

/**
 * ฟังก์ชันสำหรับตรวจสอบว่า IP ถูกบล็อกหรือไม่
 * @param identifier - IP address หรือ username
 * @returns {boolean} true หากถูกบล็อก
 */
export function isRateLimited(identifier: string): boolean {
  const attempt = loginAttempts.get(identifier);
  
  if (!attempt) return false;
  
  // ตรวจสอบว่าเลยเวลาบล็อกหรือยัง
  if (Date.now() - attempt.lastAttempt > LOCKOUT_DURATION) {
    loginAttempts.delete(identifier);
    return false;
  }
  
  return attempt.count >= MAX_LOGIN_ATTEMPTS;
}

/**
 * ฟังก์ชันสำหรับบันทึกการพยายามเข้าสู่ระบบ
 * @param identifier - IP address หรือ username
 * @param success - สถานะการเข้าสู่ระบบ
 */
export function recordLoginAttempt(identifier: string, success: boolean): void {
  if (success) {
    // ล้างข้อมูลการพยายามหากเข้าสู่ระบบสำเร็จ
    loginAttempts.delete(identifier);
    return;
  }
  
  const attempt = loginAttempts.get(identifier);
  
  if (attempt) {
    attempt.count += 1;
    attempt.lastAttempt = Date.now();
  } else {
    loginAttempts.set(identifier, { count: 1, lastAttempt: Date.now() });
  }
}

/**
 * ฟังก์ชันสำหรับดึงข้อมูลการพยายามเข้าสู่ระบบ
 * @param identifier - IP address หรือ username
 * @returns {object|null} ข้อมูลการพยายามเข้าสู่ระบบ
 */
export function getLoginAttempts(identifier: string): { count: number; remainingAttempts: number; isLocked: boolean } | null {
  const attempt = loginAttempts.get(identifier);
  
  if (!attempt) {
    return { count: 0, remainingAttempts: MAX_LOGIN_ATTEMPTS, isLocked: false };
  }
  
  const isLocked = isRateLimited(identifier);
  const remainingAttempts = Math.max(0, MAX_LOGIN_ATTEMPTS - attempt.count);
  
  return { count: attempt.count, remainingAttempts, isLocked };
}

// ============================================
// การสร้าง Token ที่ปลอดภัย
// ============================================

/**
 * ฟังก์ชันสำหรับสร้าง random token
 * @param length - ความยาวของ token
 * @returns {string} token ที่สร้างขึ้น
 */
export function generateSecureToken(length: number = 32): string {
  const { randomBytes } = require('crypto');
  return randomBytes(Math.ceil(length * 3 / 4)).toString('base64url').slice(0, length);
}

/**
 * hash ของ session token สำหรับเก็บในฐานข้อมูล (SHA-256 hex)
 * cookie เก็บ token ดิบ แต่ DB เก็บเฉพาะ hash — ถ้าฐานข้อมูล/แบ็กอัป/log รั่ว จะเอา token ไปสวม session ไม่ได้
 * (token สุ่ม 384 บิต จึงไม่ต้อง salt/slow hash; SHA-256 พอ)
 */
export function hashSessionToken(token: string): string {
  const { createHash } = require('crypto');
  return createHash('sha256').update(token).digest('hex');
}

/**
 * ฟังก์ชันสำหรับสร้างตัวย่อชื่อ (Avatar)
 * @param name - ชื่อเต็ม
 * @returns {string} ตัวย่อ 1-2 ตัวอักษร
 */
export function generateAvatarInitials(name: string): string {
  if (!name) return 'U';
  
  const names = name.trim().split(/\s+/);
  
  if (names.length === 1) {
    return names[0].charAt(0).toUpperCase();
  }
  
  return (names[0].charAt(0) + names[names.length - 1].charAt(0)).toUpperCase();
}
