/**
 * ==================================================
 * Leave Calculation - สูตรคำนวณวันลา (ใช้ร่วมกันทั้ง server และ client)
 * ==================================================
 * รวมการคำนวณ "จำนวนวันลา" และ "ปีงบประมาณ" ไว้ที่เดียว แทนที่ตรรกะเดิมที่
 * กระจายอยู่ 4 จุด (API สร้าง/แก้ไขการลา, สถิติ dashboard, ฟอร์มพิมพ์/PDF) ซึ่งมีค่าคงที่
 * ไม่ตรงกัน (ครึ่งวัน 0.4 vs 0.5, เกณฑ์ชั่วโมง ≤3?0.5:1 vs /10)
 *
 * ไฟล์นี้ต้องไม่ import Prisma หรือโค้ดฝั่ง server อื่นใด เพราะถูก import
 * โดย client component (เช่น LeaveForm.tsx) ด้วย
 */

/** วันหยุดที่ต้องไม่นับเป็นวันลา (ต้องการแค่ field date) */
export interface HolidayLike {
  date: Date | string;
}

/** กฎการคำนวณวันลาที่ปรับได้ต่อปีงบประมาณ (ดู model LeaveRule) */
export interface LeaveDayRule {
  /** ลาแบบระบุชั่วโมง: ชม. ไม่เกินเกณฑ์นี้ = ครึ่งวัน, เกินเกณฑ์ = เต็มวัน */
  hourThreshold: number;
  /** สัดส่วนวันลาสำหรับ "ครึ่งวัน" (ทั้งกรณีติ๊กลาครึ่งวัน และกรณีลาเป็นชั่วโมงไม่เกิน hourThreshold) */
  halfDayFraction: number;
}

/** ค่าเริ่มต้น - ตรงกับตรรกะเดิมที่ใช้บันทึก Leave.totalDays จริงในฐานข้อมูลปัจจุบัน */
export const DEFAULT_LEAVE_RULE: LeaveDayRule = {
  hourThreshold: 3,
  halfDayFraction: 0.5,
};

/**
 * หาปีงบประมาณ (ปีที่ปีงบประมาณเริ่มต้น คือ 1 ต.ค. ของปีนั้น)
 * ปีงบประมาณไทย: 1 ต.ค. ปีก่อนหน้า - 30 ก.ย. ของปีที่ระบุ
 * เช่น 15 ม.ค. 2569 (ค.ศ. 2026) อยู่ในปีงบประมาณที่เริ่ม ต.ค. 2568 (ค.ศ. 2025) → คืนค่า 2025
 */
export function getFiscalYear(date: Date | string): number {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth(); // 0-indexed
  return month >= 9 ? year : year - 1;
}

/** ช่วงวันที่ของปีงบประมาณที่ครอบคลุมวันที่ระบุ (1 ต.ค. - 30 ก.ย.) */
export function getFiscalYearRange(date: Date | string): { start: Date; end: Date } {
  const fiscalStartYear = getFiscalYear(date);
  return {
    start: new Date(fiscalStartYear, 9, 1),
    end: new Date(fiscalStartYear + 1, 8, 30),
  };
}

/**
 * คำนวณจำนวนวันลา (หน่วยเป็นวัน) จากวันที่เริ่ม-สิ้นสุด, ลาครึ่งวัน, ลาเป็นชั่วโมง และวันหยุด
 * เป็นแหล่งความจริงเดียวสำหรับการคำนวณ - เรียกใช้ตอนสร้าง/แก้ไขรายการลาเท่านั้น
 * (ค่าที่คำนวณได้จะถูกบันทึกไว้ที่ Leave.totalDays แล้วให้ทุกที่ที่แสดงผลอ่านค่านั้นแทนการคำนวณซ้ำ)
 */
export function calculateLeaveDays(
  startDate: Date | string,
  endDate: Date | string,
  isHalfDay: boolean,
  hours: number | null | undefined,
  holidays: HolidayLike[] = [],
  rule: LeaveDayRule = DEFAULT_LEAVE_RULE,
): number {
  if (hours && hours > 0) {
    return hours <= rule.hourThreshold ? rule.halfDayFraction : 1;
  }
  if (isHalfDay) {
    return rule.halfDayFraction;
  }

  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);

  let count = 0;
  const current = new Date(start);
  while (current <= end) {
    const dayOfWeek = current.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      const isHoliday = holidays.some((h) => {
        const hDate = new Date(h.date);
        return (
          hDate.getFullYear() === current.getFullYear() &&
          hDate.getMonth() === current.getMonth() &&
          hDate.getDate() === current.getDate()
        );
      });
      if (!isHoliday) count++;
    }
    current.setDate(current.getDate() + 1);
  }
  return count;
}
