/**
 * ==================================================
 * API Route: GET /api/dashboard/leave-stats
 * ==================================================
 * API สำหรับดึงข้อมูลสถิติการลาแยกตามผู้ใช้/ประเภท/เดือน
 * รองรับการกรองด้วย ปีงบประมาณ, ช่วงเวลา, ประเภทการลา
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { logger } from '@/lib/logger';

/**
 * แปลงปี ค.ศ. เป็น พ.ศ. อย่างปลอดภัย (ป้องกันบวกซ้ำ)
 */
function toBuddhistYear(year: number): number {
  // ถ้าปีมากกว่า 2500 แสดงว่าเป็น พ.ศ. อยู่แล้ว ไม่ต้องบวก
  return year > 2500 ? year : year + 543;
}

/**
 * ดึงปี ค.ศ. จาก Date อย่างปลอดภัย
 */
function safeGetGregorianYear(date: Date): number {
  const y = date.getFullYear();
  // ถ้า > 2500 แสดงว่าเป็น พ.ศ. ต้องลบ 543 กลับ
  return y > 2500 ? y - 543 : y;
}

/**
 * คำนวณช่วงปีงบประมาณ (1 ต.ค. - 30 ก.ย.)
 * รับปี ค.ศ. ที่เป็นจุดเริ่มต้น (เช่น 2025 = ปีงบฯ ต.ค. 2025 - ก.ย. 2026)
 */
function getFiscalYearRange(date: Date): { start: Date; end: Date; fiscalStartYear: number } {
  const year = safeGetGregorianYear(date);
  const month = date.getMonth();
  const fiscalStartYear = month >= 9 ? year : year - 1;
  return {
    start: new Date(fiscalStartYear, 9, 1),
    end: new Date(fiscalStartYear + 1, 8, 30, 23, 59, 59),
    fiscalStartYear,
  };
}

/**
 * GET /api/dashboard/leave-stats
 *
 * Query Parameters:
 * - fiscalYear: ปี ค.ศ. ที่เริ่มต้นปีงบประมาณ (เช่น 2025 = ปีงบฯ 2568-2569)
 * - type: ประเภทการลา (SICK, PERSONAL, MATERNITY, ...)
 * - startDate: วันเริ่มต้น custom (YYYY-MM-DD)
 * - endDate: วันสิ้นสุด custom (YYYY-MM-DD)
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, error: authResult.error, message: authResult.message },
        { status: authResult.status },
      );
    }

    // ข้อมูลสรุประดับกอง (ใบลา/คลัง/ครุภัณฑ์ของทุกคน) — พนักงานทั่วไปไม่มีสิทธิ์ (หน้าแดชบอร์ดก็ redirect EMPLOYEE ออกอยู่แล้ว
    // แต่ต้องกันที่ API ด้วย ไม่ใช่แค่ซ่อน UI)
    if (authResult.user!.role === 'EMPLOYEE') {
      return NextResponse.json(
        { success: false, error: 'FORBIDDEN', message: 'คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้' },
        { status: 403 }
      );
    }

    // อ่าน query params
    const { searchParams } = new URL(request.url);
    const fiscalYearParam = searchParams.get('fiscalYear'); // ปี ค.ศ.
    const typeParam = searchParams.get('type');
    const customStartDate = searchParams.get('startDate');
    const customEndDate = searchParams.get('endDate');

    // คำนวณช่วงปีงบประมาณ
    let fiscalRange: { start: Date; end: Date; fiscalStartYear: number };
    if (fiscalYearParam) {
      let fy = parseInt(fiscalYearParam);
      // ถ้าส่งมาเป็น พ.ศ. ให้แปลงกลับ
      if (fy > 2500) fy = fy - 543;
      fiscalRange = {
        start: new Date(fy, 9, 1),
        end: new Date(fy + 1, 8, 30, 23, 59, 59),
        fiscalStartYear: fy,
      };
    } else {
      fiscalRange = getFiscalYearRange(new Date());
    }

    // กำหนดช่วงวันที่สำหรับ query
    let queryStart = fiscalRange.start;
    let queryEnd = fiscalRange.end;

    if (customStartDate) {
      queryStart = new Date(customStartDate);
    }
    if (customEndDate) {
      queryEnd = new Date(customEndDate + 'T23:59:59');
    }

    // สร้าง where clause - รองรับทั้งวันที่ ค.ศ. และ พ.ศ. ที่อาจหลุดเข้าไปใน DB
    const beQueryStart = new Date(queryStart.getFullYear() + 543, queryStart.getMonth(), queryStart.getDate());
    const beQueryEnd = new Date(queryEnd.getFullYear() + 543, queryEnd.getMonth(), queryEnd.getDate(), 23, 59, 59);

    const where: any = {
      OR: [
        // ช่วงปี ค.ศ. ปกติ (เช่น 2025-10-01 ถึง 2026-09-30)
        {
          startDate: {
            gte: queryStart,
            lte: queryEnd,
          },
        },
        // ช่วงปี พ.ศ. ที่อาจถูกบันทึกผิด (เช่น 2568-10-01 ถึง 2569-09-30)
        {
          startDate: {
            gte: beQueryStart,
            lte: beQueryEnd,
          },
        },
      ],
      status: { in: ['APPROVED', 'PENDING'] },
    };

    // กรองประเภทการลา
    if (typeParam && typeParam !== 'ALL') {
      where.type = typeParam;
    }

    // ดึงการลาทั้งหมด
    const leaves = await prisma.leave.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            prefix: true,
            name: true,
            avatar: true,
            department: true,
          },
        },
      },
      orderBy: { startDate: 'asc' },
    });

    // Thai month names
    const thaiMonths = [
      'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
      'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
    ];

    // สร้าง fiscal year months (ต.ค. -> ก.ย.)
    const { fiscalStartYear } = fiscalRange;
    const fiscalMonths: { month: number; year: number; label: string }[] = [];
    for (let i = 0; i < 12; i++) {
      const m = (9 + i) % 12; // 9=ต.ค., 10=พ.ย., ..., 8=ก.ย.
      const y = m >= 9 ? fiscalStartYear : fiscalStartYear + 1;
      const buddhistYear = toBuddhistYear(y).toString().slice(-2);
      fiscalMonths.push({
        month: m,
        year: y,
        label: `${thaiMonths[m]}${buddhistYear}`,
      });
    }

    // สร้างข้อมูลแยกตามผู้ใช้
    const userMap = new Map<
      number,
      {
        userId: number;
        userName: string;
        avatar: string | null;
        department: string | null;
        leaves: {
          id: number;
          userId: number;
          type: string;
          startDate: string;
          endDate: string;
          days: number;
          isHalfDay: boolean;
          hours: number | null;
          status: string;
          month: number;
          year: number;
        }[];
      }
    >();

    for (const leave of leaves) {
      if (!userMap.has(leave.userId)) {
        userMap.set(leave.userId, {
          userId: leave.userId,
          userName: `${(leave.user as any).prefix || ''}${leave.user.name}`,
          avatar: leave.user.avatar,
          department: leave.user.department,
          leaves: [],
        });
      }

      // ใช้ totalDays ที่บันทึกไว้ตอนสร้าง/แก้ไขรายการลา (คำนวณครั้งเดียวด้วยกฎที่มีผล ณ ตอนนั้น)
      const days = leave.totalDays;

      const startMonth = new Date(leave.startDate).getMonth();
      const startYear = safeGetGregorianYear(new Date(leave.startDate));

      userMap.get(leave.userId)!.leaves.push({
        id: leave.id,
        userId: leave.userId,
        type: leave.type,
        startDate: leave.startDate.toISOString(),
        endDate: leave.endDate.toISOString(),
        days,
        isHalfDay: leave.isHalfDay,
        hours: leave.hours,
        status: leave.status,
        month: startMonth,
        year: startYear,
      });
    }

    // สร้าง chart data
    const chartData = fiscalMonths.map((fm) => {
      const monthData: Record<string, any> = {
        month: fm.label,
        monthIndex: fm.month,
        year: fm.year,
      };

      Array.from(userMap.values()).forEach((userData) => {
        const userMonthLeaves = userData.leaves.filter(
          (l) => l.month === fm.month && l.year === fm.year,
        );
        if (userMonthLeaves.length > 0) {
          const totalDays = userMonthLeaves.reduce((sum, l) => sum + l.days, 0);
          monthData[`user_${userData.userId}`] = Math.round(totalDays * 100) / 100;
        }
      });

      return monthData;
    });

    // สร้าง per-user per-type summary
    const userSummaries = Array.from(userMap.values()).map((u) => {
      const byType: Record<string, { count: number; days: number }> = {};
      for (const l of u.leaves) {
        if (!byType[l.type]) byType[l.type] = { count: 0, days: 0 };
        byType[l.type].count++;
        byType[l.type].days += l.days;
      }
      return {
        userId: u.userId,
        userName: u.userName,
        avatar: u.avatar,
        department: u.department,
        byType,
        totalCount: u.leaves.length,
        totalDays: Math.round(u.leaves.reduce((s, l) => s + l.days, 0) * 100) / 100,
      };
    });

    // สร้าง fiscal year label (พ.ศ.)
    const fyStart = toBuddhistYear(fiscalStartYear);
    const fyEnd = toBuddhistYear(fiscalStartYear + 1);

    // สร้างรายการปีงบประมาณย้อนหลัง 5 ปี
    const availableFiscalYears: { label: string; value: number }[] = [];
    const currentFiscalStartYear = getFiscalYearRange(new Date()).fiscalStartYear;
    for (let i = 0; i < 5; i++) {
      const fy = currentFiscalStartYear - i;
      availableFiscalYears.push({
        label: `${toBuddhistYear(fy)} - ${toBuddhistYear(fy + 1)}`,
        value: fy,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        fiscalYear: `${fyStart} - ${fyEnd}`,
        fiscalStartYear,
        availableFiscalYears,
        fiscalRange: {
          start: fiscalRange.start.toISOString(),
          end: fiscalRange.end.toISOString(),
        },
        fiscalMonths: fiscalMonths.map((fm) => fm.label),
        chartData,
        users: Array.from(userMap.values()).map((u) => ({
          userId: u.userId,
          userName: u.userName,
          avatar: u.avatar,
          department: u.department,
        })),
        userSummaries,
        leaves: Array.from(userMap.values()).flatMap((u) => u.leaves),
      },
    });
  } catch (error) {
    logger.error('Leave stats error', { error });
    return NextResponse.json(
      {
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'เกิดข้อผิดพลาดภายในระบบ',
      },
      { status: 500 },
    );
  }
}
