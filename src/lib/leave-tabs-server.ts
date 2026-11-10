/**
 * ==================================================
 * Leave Tabs (server) - แปลง LeaveTab เป็น Prisma where-fragment
 * ==================================================
 * แยกจาก leave-tabs.ts เพราะไฟล์นั้นต้อง client-safe (ไม่ import Prisma)
 */

import type { Prisma } from '@prisma/client';
import type { LeaveTab } from './leave-tabs';

/**
 * คืนค่า array ของ where-fragment สำหรับแท็บที่ระบุ (เอาไปรวมกับ where.AND อื่นๆ)
 * คืน [] ถ้า tab เป็น null (ไม่กรอง)
 *
 * ต้องรวมเข้ากับ fragment อื่น (เช่น ช่วงวันที่) ผ่าน array เดียวกันก่อน assign ให้ where.AND
 * ห้าม assign where.AND ทับตรงๆ เพราะจะทำให้ filter อื่นที่ใช้ AND อยู่แล้วหายไป
 */
export function buildLeaveTabWhere(tab: LeaveTab | null): Prisma.LeaveWhereInput[] {
  if (tab === 'LATE_ARRIVAL') {
    return [{ type: 'LATE_ARRIVAL' }];
  }
  if (tab === 'EARLY_LEAVE') {
    return [{ type: 'EARLY_LEAVE' }];
  }
  if (tab === 'KBK') {
    return [
      { type: { not: 'LATE_ARRIVAL' } },
      { type: { not: 'EARLY_LEAVE' } },
      {
        OR: [
          { formCategory: 'KBK' },
          { formCategory: null, OR: [{ hours: null }, { hours: { lte: 0 } }] },
        ],
      },
    ];
  }
  if (tab === 'STATS') {
    return [
      { type: { not: 'LATE_ARRIVAL' } },
      { type: { not: 'EARLY_LEAVE' } },
      {
        OR: [
          { formCategory: 'STATS' },
          { formCategory: null, hours: { gt: 0 } },
        ],
      },
    ];
  }
  return [];
}
