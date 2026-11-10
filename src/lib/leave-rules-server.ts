/**
 * ==================================================
 * Leave Rule Lookup (server-only)
 * ==================================================
 * หากฎการลาที่มีผลกับวันที่ระบุ (ตามปีงบประมาณ) สำหรับใช้คำนวณ Leave.totalDays
 * แยกจาก src/lib/leave-calc.ts เพราะไฟล์นี้ import Prisma (ห้ามใช้ใน client component)
 */

import { prisma } from './prisma';
import { getFiscalYear, DEFAULT_LEAVE_RULE, type LeaveDayRule } from './leave-calc';

/**
 * หากฎการลาที่มีผลกับวันที่ระบุ:
 * 1) กฎที่ผูกกับปีงบประมาณนั้นโดยตรง (fiscalYear ตรงกัน + isActive)
 * 2) ถ้าไม่มี ใช้กฎ fallback (fiscalYear = null + isActive) ล่าสุด
 * 3) ถ้าไม่มีทั้งคู่ ใช้ค่าเริ่มต้นในโค้ด (DEFAULT_LEAVE_RULE)
 */
export async function getEffectiveLeaveRule(date: Date | string): Promise<LeaveDayRule> {
  const fiscalYear = getFiscalYear(date);

  const specific = await prisma.leaveRule.findFirst({
    where: { fiscalYear, isActive: true },
  });
  if (specific) {
    return { hourThreshold: specific.hourThreshold, halfDayFraction: specific.halfDayFraction };
  }

  const fallback = await prisma.leaveRule.findFirst({
    where: { fiscalYear: null, isActive: true },
    orderBy: { createdAt: 'desc' },
  });
  if (fallback) {
    return { hourThreshold: fallback.hourThreshold, halfDayFraction: fallback.halfDayFraction };
  }

  return DEFAULT_LEAVE_RULE;
}
