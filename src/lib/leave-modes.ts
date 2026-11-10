/**
 * ==================================================
 * Leave Modes - รูปแบบการลาที่แต่ละประเภทเลือกได้ (เต็มวัน / ครึ่งวัน / รายชั่วโมง)
 * ==================================================
 * รวมกฎ "ประเภทไหนใช้รูปแบบไหนได้" ไว้ที่เดียว แทนเงื่อนไขที่กระจายอยู่ในหลายจุดของหน้าลา
 * - มาสาย: ใช้โหมดเวลาเท่านั้น (เวลาเข้างานล็อก 08:30 น. เทียบกับเวลาที่มาถึงจริง)
 * - ลาบวช: เต็มวัน/ครึ่งวันเท่านั้น ไม่มีรายชั่วโมง (ฝั่งเซิร์ฟเวอร์กันซ้ำที่ createLeaveSchema)
 * - ประเภทอื่น: เลือกได้ทั้งสามแบบ
 *
 * ไม่ import Prisma/โค้ดฝั่ง server เพราะถูกใช้ใน client component
 */

export type LeaveMode = 'fullday' | 'halfday' | 'hours';

const ALL_MODES: LeaveMode[] = ['fullday', 'halfday', 'hours'];

/** รูปแบบการลาที่ประเภทนี้เลือกได้ (ลำดับแรก = ค่าที่ใช้เมื่อโหมดเดิมใช้ไม่ได้) */
export function allowedModesFor(type: string): LeaveMode[] {
  if (type === 'LATE_ARRIVAL') return ['hours'];
  if (type === 'ORDINATION') return ['fullday', 'halfday'];
  return ALL_MODES;
}

/** ปรับโหมดให้อยู่ในรูปแบบที่ประเภทนี้อนุญาต (ถ้าโหมดเดิมใช้ได้ คงไว้) */
export function coerceMode(type: string, mode: LeaveMode): LeaveMode {
  const allowed = allowedModesFor(type);
  return allowed.includes(mode) ? mode : allowed[0];
}
