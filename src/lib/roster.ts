/**
 * ==================================================
 * Roster - ตารางเวรประจำกอง: ค่าคงที่ + ฟังก์ชันคำนวณสถิติ (pure, ไม่พึ่ง DB)
 * ==================================================
 */

export const ROSTER_CATEGORIES = ['DUTY', 'OFFICIAL_TRIP', 'MEETING', 'TRAINING', 'EVENT', 'OTHER'] as const;
export type RosterCategoryKey = (typeof ROSTER_CATEGORIES)[number];

export const ROSTER_CATEGORY_LABELS: Record<RosterCategoryKey, string> = {
  DUTY: 'เวร',
  OFFICIAL_TRIP: 'ไปราชการ',
  MEETING: 'ประชุม',
  TRAINING: 'อบรม/สัมมนา',
  EVENT: 'งานพิธี/กิจกรรม',
  OTHER: 'อื่นๆ',
};

const DAY_MS = 24 * 60 * 60 * 1000;

const BANGKOK_TZ = 'Asia/Bangkok';
// en-CA ให้รูปแบบ YYYY-MM-DD; ระบุเขตเวลาตายตัว เพื่อไม่ให้ผลเปลี่ยนตามเขตเวลาของเซิร์ฟเวอร์/เบราว์เซอร์
// (เซิร์ฟเวอร์ UTC จะเห็น "วันนี้" ผิดช่วง 00:00-07:00 เวลาไทย ถ้าใช้เวลาท้องถิ่นของเครื่อง)
const bangkokDateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: BANGKOK_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** วันที่แบบ YYYY-MM-DD ตามเวลาประเทศไทย (Asia/Bangkok) */
export function toDateString(d: Date): string {
  return bangkokDateFormat.format(d);
}

/** วันนี้ตามเวลาประเทศไทย เป็น YYYY-MM-DD */
export function bangkokToday(now: Date = new Date()): string {
  return toDateString(now);
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** ช่วงเดือน (วันแรก–วันสุดท้าย) ที่ date อยู่ ตามเวลาไทย; monthOffset เลื่อนไป/ก่อนกี่เดือน (เช่น -1 = เดือนก่อน) */
export function monthRange(date: Date, monthOffset = 0): { from: string; to: string } {
  const [y, m] = toDateString(date).split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1 + monthOffset, 1));
  const year = base.getUTCFullYear();
  const month = base.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${year}-${pad2(month)}-01`, to: `${year}-${pad2(month)}-${pad2(lastDay)}` };
}

/** ปีงบประมาณ (1 ต.ค. – 30 ก.ย.) ที่ครอบคลุมวันที่ date ตามเวลาไทย เป็น YYYY-MM-DD (ปี ค.ศ.) */
export function fiscalYearRangeStrings(date: Date): { from: string; to: string } {
  const [y, m] = toDateString(date).split('-').map(Number);
  const startYear = m >= 10 ? y : y - 1;
  return { from: `${startYear}-10-01`, to: `${startYear + 1}-09-30` };
}

/**
 * จำนวนวัน (นับรวมวันแรกและวันสุดท้าย) ของงาน [start,end] ที่ตกอยู่ในช่วง [from,to]
 * ทุกค่าเป็น YYYY-MM-DD หรือ Date ที่เป็นวันที่ล้วน (UTC เที่ยงคืน) — งานที่ไม่ซ้อนช่วงคืน 0
 */
export function overlapDays(
  start: Date | string,
  end: Date | string,
  from: Date | string,
  to: Date | string
): number {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  const f = new Date(from).getTime();
  const t = new Date(to).getTime();
  const lo = Math.max(s, f);
  const hi = Math.min(e, t);
  if (hi < lo) return 0;
  return Math.floor((hi - lo) / DAY_MS) + 1;
}

export interface RosterStatsInput {
  category: RosterCategoryKey;
  startDate: Date | string;
  endDate: Date | string;
}

export interface RosterStats {
  count: number;
  days: number;
  byCategory: Record<RosterCategoryKey, number>;
}

export function emptyCategoryCounts(): Record<RosterCategoryKey, number> {
  return { DUTY: 0, OFFICIAL_TRIP: 0, MEETING: 0, TRAINING: 0, EVENT: 0, OTHER: 0 };
}

/** สถิติของรายการงาน (จำนวนงาน / จำนวนวันที่ซ้อนช่วง / แยกตามประเภท) */
export function computeRosterStats(
  items: RosterStatsInput[],
  from: Date | string,
  to: Date | string
): RosterStats {
  const byCategory = emptyCategoryCounts();
  let days = 0;
  for (const it of items) {
    byCategory[it.category] += 1;
    days += overlapDays(it.startDate, it.endDate, from, to);
  }
  return { count: items.length, days, byCategory };
}
