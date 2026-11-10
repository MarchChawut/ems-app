/**
 * ==================================================
 * Leave Tabs - จัดกลุ่มรายการลาเป็น 3 แท็บ (ใช้ร่วมกันทั้ง server และ client)
 * ==================================================
 * ไฟล์นี้ต้องไม่ import Prisma หรือโค้ดฝั่ง server อื่นใด เพราะถูก import
 * โดย client component ด้วย (ดูรูปแบบเดียวกับ leave-calc.ts)
 */

export type LeaveTab = 'KBK' | 'STATS' | 'LATE_ARRIVAL' | 'EARLY_LEAVE';

/**
 * ตัดสินว่า leave record นี้อยู่แท็บไหน (คำนวณตอนอ่าน ไม่ persist ค่านี้)
 * - type === LATE_ARRIVAL ชนะเสมอ ไม่ว่า formCategory จะเป็นอะไร
 * - type === EARLY_LEAVE ชนะเสมอเช่นกัน (รองจาก LATE_ARRIVAL)
 * - formCategory ที่ระบุไว้ชัดเจน (KBK/STATS) ใช้ตามนั้น
 * - formCategory เป็น null (รายการเก่า/ไม่เคยเลือก) ให้จัดกลุ่มจากชั่วโมง:
 *   มี hours > 0 (ลาเป็นชั่วโมง) → STATS, ไม่งั้น (ครึ่งวัน/เต็มวัน) → KBK
 *
 * หมายเหตุ: TIME_RANGE_TYPES (LATE_ARRIVAL, EARLY_LEAVE, RUN_AN_ERRAND) ไม่ใช่ตัวตัดสินแท็บทั้งหมด
 * มีแค่ LATE_ARRIVAL และ EARLY_LEAVE เท่านั้นที่มีแท็บของตัวเอง ส่วน RUN_AN_ERRAND จัดกลุ่มแบบ KBK/STATS ปกติ
 */
export function resolveLeaveTab(leave: {
  type: string;
  formCategory: string | null;
  hours?: number | null;
}): LeaveTab {
  if (leave.type === 'LATE_ARRIVAL') return 'LATE_ARRIVAL';
  if (leave.type === 'EARLY_LEAVE') return 'EARLY_LEAVE';
  if (leave.formCategory === 'KBK') return 'KBK';
  if (leave.formCategory === 'STATS') return 'STATS';
  return leave.hours && leave.hours > 0 ? 'STATS' : 'KBK';
}

/** แปลงค่าจาก query string เป็น LeaveTab ที่ถูกต้อง (null = ไม่กรอง) */
export function parseLeaveTab(raw: string | null): LeaveTab | null {
  return raw === 'KBK' || raw === 'STATS' || raw === 'LATE_ARRIVAL' || raw === 'EARLY_LEAVE' ? raw : null;
}

export const LEAVE_TAB_LABELS: Record<LeaveTab, string> = {
  KBK: 'การลา (แบบส่ง กบก.)',
  STATS: 'การลา (แบบเก็บสถิติ)',
  LATE_ARRIVAL: 'ขอปฏิบัติหน้าที่ฯ หลังเวลา 08.30 น.',
  EARLY_LEAVE: 'ขอออกก่อนเวลา',
};
