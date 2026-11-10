/**
 * ==================================================
 * API Route: GET /api/roster/summary
 * ==================================================
 * สรุปตารางเวรประจำกองสำหรับแดชบอร์ด (ทุกคนที่ล็อกอินดูได้)
 * - สถิติของเดือนนี้ (จำนวนงาน/วัน/แยกประเภท/คนที่มีงานมากสุด)
 * - คนที่มีงานวันนี้ และงานที่จะถึงใน 7 วันข้างหน้า
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { computeRosterStats, monthRange, toDateString } from '@/lib/roster';

const USER_SELECT = { id: true, prefix: true, name: true, position: true } as const;

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, error: authResult.error, message: authResult.message },
        { status: authResult.status }
      );
    }

    // วันที่ทั้งหมดคำนวณตามเวลาไทย (Asia/Bangkok) ไม่ขึ้นกับเขตเวลาของเซิร์ฟเวอร์
    const now = new Date();
    const today = toDateString(now);
    const weekEnd = toDateString(new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000));
    const { from, to } = monthRange(now);

    const activeOnly = { user: { isActive: true } };

    const [monthItems, todayItems, upcomingItems] = await Promise.all([
      prisma.rosterAssignment.findMany({
        where: { ...activeOnly, startDate: { lte: new Date(to) }, endDate: { gte: new Date(from) } },
        select: { userId: true, category: true, startDate: true, endDate: true },
      }),
      prisma.rosterAssignment.findMany({
        where: { ...activeOnly, startDate: { lte: new Date(today) }, endDate: { gte: new Date(today) } },
        include: { user: { select: USER_SELECT } },
        orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
        take: 30,
      }),
      prisma.rosterAssignment.findMany({
        where: {
          ...activeOnly,
          startDate: { gt: new Date(today), lte: new Date(weekEnd) },
        },
        include: { user: { select: USER_SELECT } },
        orderBy: [{ startDate: 'asc' }, { startTime: 'asc' }, { id: 'asc' }],
        take: 8,
      }),
    ]);

    const stats = computeRosterStats(monthItems, from, to);

    // คนที่มีงานมากสุดของเดือนนี้ (เรียงตามจำนวนงาน แล้วตามจำนวนวัน)
    const perUser = new Map<number, { count: number; days: number }>();
    for (const it of monthItems) {
      const cur = perUser.get(it.userId) ?? { count: 0, days: 0 };
      const s = computeRosterStats([it], from, to);
      perUser.set(it.userId, { count: cur.count + 1, days: cur.days + s.days });
    }
    const topIds = [...perUser.entries()]
      .sort((a, b) => b[1].count - a[1].count || b[1].days - a[1].days)
      .slice(0, 5);
    const topUsers = topIds.length
      ? await prisma.user.findMany({ where: { id: { in: topIds.map(([id]) => id) } }, select: USER_SELECT })
      : [];
    const topPeople = topIds
      .map(([id, v]) => ({ user: topUsers.find((u) => u.id === id), ...v }))
      .filter((x) => x.user);

    return NextResponse.json({
      success: true,
      data: {
        month: { from, to },
        monthTotal: stats.count,
        monthDays: stats.days,
        peopleInvolved: perUser.size,
        byCategory: stats.byCategory,
        outToday: todayItems,
        upcoming: upcomingItems,
        topPeople,
      },
    });
  } catch (error) {
    logger.error('Get roster summary error', { error });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      { status: 500 }
    );
  }
}
