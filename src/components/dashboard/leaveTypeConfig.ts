/**
 * ==================================================
 * Dashboard — Shared leave type config & formatters
 * ==================================================
 */

/**
 * สีสำหรับแต่ละประเภทการลา
 */
export const leaveTypeConfig: Record<string, { label: string; color: string; bgClass: string }> = {
  SICK: { label: 'ลาป่วย', color: '#ef4444', bgClass: 'bg-red-500' },
  PERSONAL: { label: 'ลากิจ', color: '#f97316', bgClass: 'bg-orange-500' },
  MATERNITY: { label: 'ลาคลอดบุตร', color: '#ec4899', bgClass: 'bg-pink-500' },
  ORDINATION: { label: 'ลาบวช', color: '#8b5cf6', bgClass: 'bg-violet-500' },
  EARLY_LEAVE: { label: 'ออกก่อนเวลา', color: '#ea580c', bgClass: 'bg-orange-600' },
  LATE_ARRIVAL: { label: 'มาสาย', color: '#eab308', bgClass: 'bg-yellow-500' },
  RUN_AN_ERRAND: { label: 'ออกนอกเขตพระราชฐาน', color: '#06b6d4', bgClass: 'bg-cyan-500' },
  OTHER: { label: 'ลาอื่นๆ', color: '#64748b', bgClass: 'bg-slate-500' },
};

/**
 * ฟอร์แมตจำนวนวัน (รองรับครึ่งวัน/ชม.)
 */
export function fmtDays(days: number): string {
  if (days === 0) return '0';
  if (days % 1 === 0) return `${days}`;
  return days.toFixed(1);
}
