/**
 * ==================================================
 * Leave page config - ค่าคงที่และตัวจัดรูปแบบที่ใช้ร่วมกันในหน้าลา
 * ==================================================
 * แยกออกจาก LeavesPageClient เพื่อให้ LeaveCard (React.memo) import ได้โดยไม่เกิด circular import
 */

import { LeaveType, LeaveStatus } from '@/types';
import { safeGetGregorianYear } from '@/lib/utils';

/**
 * สีและข้อความของประเภทการลา
 */
export const leaveTypeConfig: Record<LeaveType, { label: string; bg: string; text: string; icon: string }> = {
  SICK: { label: 'ลาป่วย', bg: 'bg-rose-100', text: 'text-rose-600', icon: '🏥' },
  PERSONAL: { label: 'ลากิจ', bg: 'bg-amber-100', text: 'text-amber-600', icon: '💼' },
  MATERNITY: { label: 'ลาคลอดบุตร', bg: 'bg-pink-100', text: 'text-pink-600', icon: '👶' },
  ORDINATION: { label: 'ลาบวช', bg: 'bg-purple-100', text: 'text-purple-600', icon: '🧘' },
  EARLY_LEAVE: { label: 'ออกก่อนเวลา', bg: 'bg-orange-100', text: 'text-orange-600', icon: '🕐' },
  LATE_ARRIVAL: { label: 'มาสาย', bg: 'bg-yellow-100', text: 'text-yellow-700', icon: '⏰' },
  RUN_AN_ERRAND: { label: 'ออกนอกเขตพระราชฐาน', bg: 'bg-cyan-100', text: 'text-cyan-600', icon: '🚶' },
  OTHER: { label: 'อื่นๆ', bg: 'bg-slate-100', text: 'text-slate-600', icon: '📝' },
};

// ประเภทลาที่ใช้ตัวเลือก "เวลาออก / เวลากลับ" แทนปุ่มเลือกจำนวนชั่วโมง
export const TIME_RANGE_TYPES: LeaveType[] = ['LATE_ARRIVAL', 'EARLY_LEAVE', 'RUN_AN_ERRAND'];

// มาสาย: เวลาที่ต้องมาถึง (เวลาเข้างาน) ถูกล็อกไว้ พนักงานกรอกเฉพาะเวลาที่มาถึงจริง
// ค่าที่ใช้จริงมาจากการตั้งค่าฟีเจอร์ "การลา" (หน้าตั้งค่า > ฟีเจอร์ของระบบ, ค่าเริ่มต้น 08:30 — ดู src/lib/features.ts)
// ค่าคงที่นี้เป็นเพียง fallback สำหรับโค้ดที่อยู่นอก FeaturesProvider
export const LATE_ARRIVAL_FIXED_TIME = '08:30';

// จำนวนรายการลาต่อหน้า (แบ่งหน้าเพื่อไม่ให้ดึงข้อมูลทั้งตารางในครั้งเดียว)
export const LEAVES_PAGE_SIZE = 50;

/**
 * สีและข้อความของสถานะการลา
 */
export const leaveStatusConfig: Record<LeaveStatus, { label: string; bg: string; text: string }> = {
  PENDING: { label: 'รอธุรการตรวจสอบ', bg: 'bg-amber-100', text: 'text-amber-700' },
  ADMIN_REVIEWED: { label: 'ธุรการตรวจสอบแล้ว รอหัวหน้างานเซ็น', bg: 'bg-indigo-100', text: 'text-indigo-700' },
  SUPERVISOR_APPROVED: { label: 'หัวหน้างานอนุมัติแล้ว รอ ผอ.กอง', bg: 'bg-sky-100', text: 'text-sky-700' },
  APPROVED: { label: 'อนุมัติแล้ว', bg: 'bg-emerald-100', text: 'text-emerald-700' },
  REJECTED: { label: 'ไม่อนุมัติ', bg: 'bg-rose-100', text: 'text-rose-700' },
};

/**
 * จัดรูปแบบวันที่ลาแบบ พ.ศ. อย่างปลอดภัย (ป้องกันบวก 543 ซ้ำ กรณี DB มีปี พ.ศ. ค้างจาก legacy data)
 */
export function formatLeaveDate(date: string | Date): string {
  const d = new Date(date);
  d.setFullYear(safeGetGregorianYear(d));
  return d.toLocaleDateString('th-TH');
}
