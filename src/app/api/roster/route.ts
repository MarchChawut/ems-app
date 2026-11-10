/**
 * ==================================================
 * API Route: /api/roster
 * ==================================================
 * ตารางเวรประจำกอง — ใครไปงานอะไร ที่ไหน เมื่อไร
 *
 * GET  ทุกคนที่ล็อกอินดูได้: รายชื่อพนักงาน active ทุกคน + งานของแต่ละคนในช่วงที่เลือก + สถิติ
 * POST เฉพาะผู้มีสิทธิ์ roster.manage (ค่าเริ่มต้น ADMIN/SUPER_ADMIN): มอบงานให้หลายคนพร้อมกัน
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, requirePermission } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/permissions';
import { createRosterSchema } from '@/lib/security';
import { logger } from '@/lib/logger';
import {
  ROSTER_CATEGORIES,
  computeRosterStats,
  monthRange,
  type RosterCategoryKey,
} from '@/lib/roster';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// จำกัดช่วงที่ขอได้ ป้องกันการดึงงานทั้งหมดของทุกคนย้อนหลังหลายปีในครั้งเดียว (ปีงบประมาณ = 365 วัน)
const MAX_RANGE_DAYS = 400;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * GET /api/roster?from=YYYY-MM-DD&to=YYYY-MM-DD&category=DUTY&q=ชื่อ
 * ค่าเริ่มต้น: เดือนปัจจุบัน
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, error: authResult.error, message: authResult.message },
        { status: authResult.status }
      );
    }

    const sp = request.nextUrl.searchParams;
    const defaults = monthRange(new Date());
    const from = sp.get('from') ?? defaults.from;
    const to = sp.get('to') ?? defaults.to;
    if (!DATE_RE.test(from) || !DATE_RE.test(to) || new Date(to) < new Date(from)) {
      return NextResponse.json(
        { success: false, error: 'VALIDATION_ERROR', message: 'ช่วงวันที่ไม่ถูกต้อง' },
        { status: 400 }
      );
    }
    if ((new Date(to).getTime() - new Date(from).getTime()) / DAY_MS > MAX_RANGE_DAYS) {
      return NextResponse.json(
        { success: false, error: 'RANGE_TOO_LARGE', message: `เลือกช่วงวันที่ได้ไม่เกิน ${MAX_RANGE_DAYS} วัน` },
        { status: 400 }
      );
    }

    const categoryParam = sp.get('category');
    const category = ROSTER_CATEGORIES.includes(categoryParam as RosterCategoryKey)
      ? (categoryParam as RosterCategoryKey)
      : undefined;
    const q = sp.get('q')?.trim();

    const [users, assignments] = await Promise.all([
      prisma.user.findMany({
        where: {
          isActive: true,
          ...(q ? { name: { contains: q } } : {}),
        },
        select: {
          id: true,
          prefix: true,
          name: true,
          position: true,
          positionSecond: true,
          department: true,
          avatar: true,
          profileImage: true,
        },
        orderBy: { name: 'asc' },
      }),
      prisma.rosterAssignment.findMany({
        where: {
          startDate: { lte: new Date(to) },
          endDate: { gte: new Date(from) },
          ...(category ? { category } : {}),
        },
        orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
      }),
    ]);

    const byUser = new Map<number, typeof assignments>();
    for (const a of assignments) {
      const list = byUser.get(a.userId) ?? [];
      list.push(a);
      byUser.set(a.userId, list);
    }

    const people = users.map((u) => {
      const items = byUser.get(u.id) ?? [];
      return { ...u, assignments: items, stats: computeRosterStats(items, from, to) };
    });

    // สรุปรวมของช่วงที่เลือก (นับเฉพาะงานของพนักงาน active ที่แสดงอยู่)
    const shown = people.flatMap((p) => p.assignments);
    const stats = computeRosterStats(shown, from, to);
    const summary = {
      totalAssignments: stats.count,
      totalDays: stats.days,
      byCategory: stats.byCategory,
      peopleInvolved: people.filter((p) => p.assignments.length > 0).length,
      totalPeople: people.length,
    };

    return NextResponse.json({
      success: true,
      data: { from, to, people, summary },
    });
  } catch (error) {
    logger.error('Get roster error', { error });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/roster
 * Body: { userIds: number[], title, category, location?, startDate, endDate, startTime?, endTime?, note? }
 * สร้างหนึ่งแถวต่อคน (ทั้งหมดสำเร็จหรือไม่สำเร็จพร้อมกัน)
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, PERMISSIONS.ROSTER_MANAGE);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, error: authResult.error, message: authResult.message },
        { status: authResult.status }
      );
    }
    const currentUser = authResult.user!;

    const body = await request.json().catch(() => null);
    const parsed = createRosterSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'ข้อมูลไม่ถูกต้อง',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }
    const { userIds, startDate, endDate, ...fields } = parsed.data;
    const uniqueIds = Array.from(new Set(userIds));

    // ต้องเป็นพนักงาน active ที่มีอยู่จริงทุกคน
    const found = await prisma.user.count({ where: { id: { in: uniqueIds }, isActive: true } });
    if (found !== uniqueIds.length) {
      return NextResponse.json(
        { success: false, error: 'USER_NOT_FOUND', message: 'พบผู้ปฏิบัติงานที่ไม่มีในระบบหรือถูกปิดใช้งาน' },
        { status: 400 }
      );
    }

    const created = await prisma.$transaction(
      uniqueIds.map((userId) =>
        prisma.rosterAssignment.create({
          data: {
            ...fields,
            location: fields.location || null,
            startTime: fields.startTime || null,
            endTime: fields.endTime || null,
            note: fields.note || null,
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            userId,
            createdById: currentUser.id,
          },
        })
      )
    );

    logger.info('Roster assignments created', { count: created.length, by: currentUser.id });

    return NextResponse.json(
      { success: true, data: created, message: `เพิ่มงานให้ ${created.length} คนสำเร็จ` },
      { status: 201 }
    );
  } catch (error) {
    logger.error('Create roster error', { error });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      { status: 500 }
    );
  }
}
