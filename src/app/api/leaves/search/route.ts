/**
 * ==================================================
 * API Route: GET /api/leaves/search
 * ==================================================
 * API สำหรับค้นหาการลาด้วยชื่อหรือวันที่
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isManagerOrAbove } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { parseLeaveTab } from '@/lib/leave-tabs';
import { buildLeaveTabWhere } from '@/lib/leave-tabs-server';

/**
 * GET /api/leaves/search
 * ค้นหาการลาด้วยชื่อหรือวันที่
 * 
 * Query Parameters:
 * - name: ค้นหาด้วยชื่อพนักงาน
 * - date: ค้นหาว่าวันนี้มีใครลาบ้าง (YYYY-MM-DD)
 * - startDate: วันเริ่มต้นช่วงค้นหา
 * - endDate: วันสิ้นสุดช่วงค้นหา
 * - formCategory: กรองตามประเภทแบบฟอร์ม (KBK = แบบส่ง กบก., STATS = แบบเก็บสถิติ) - legacy, ใช้ tab แทน
 * - tab: กรองตามแท็บ (KBK, STATS, LATE_ARRIVAL) ดู src/lib/leave-tabs.ts
 *
 * Response:
 * {
 *   success: true,
 *   data: Leave[] // สูงสุด 200 รายการ เรียงตามวันที่เริ่มล่าสุด
 * }
 */
export async function GET(request: NextRequest) {
  try {
    // ตรวจสอบการเข้าสู่ระบบ
    const authResult = await requireAuth(request);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, error: authResult.error, message: authResult.message },
        { status: authResult.status }
      );
    }

    // ดึง query parameters
    const { searchParams } = new URL(request.url);
    const name = searchParams.get('name');
    const date = searchParams.get('date');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const formCategory = searchParams.get('formCategory');
    const tab = parseLeaveTab(searchParams.get('tab'));

    // สร้าง where clause
    const where: any = {};
    const and: any[] = [...buildLeaveTabWhere(tab)];

    // ถ้าไม่ใช่ manager ขึ้นไป ให้เห็นเฉพาะรายการตัวเอง (เหมือน GET /api/leaves)
    if (!isManagerOrAbove(authResult.user!.role)) {
      where.userId = authResult.user!.id;
    }

    // ค้นหาด้วยชื่อ
    if (name) {
      where.user = {
        name: {
          contains: name,
        },
      };
    }

    // กรองด้วยประเภทแบบฟอร์ม (แบบส่ง กบก. / แบบเก็บสถิติ)
    if (formCategory === 'KBK' || formCategory === 'STATS') {
      where.formCategory = formCategory;
    }

    // ค้นหาด้วยวันที่เฉพาะวัน
    if (date) {
      const searchDate = new Date(date);
      and.push({ startDate: { lte: searchDate } }, { endDate: { gte: searchDate } });
    }

    // ค้นหาด้วยช่วงวันที่
    if (startDate && endDate) {
      and.push({ startDate: { lte: new Date(endDate) } }, { endDate: { gte: new Date(startDate) } });
    }

    if (and.length) {
      where.AND = and;
    }

    // ดึงข้อมูลการลา
    const leaves = await prisma.leave.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
            department: true,
            division: true,
            position: true,
            phone: true,
            address: true,
            supervisorId: true,
            signatureFileId: true,
          },
        },
      },
      orderBy: { startDate: 'desc' },
      take: 200, // จำกัดผลลัพธ์ค้นหาสูงสุด ป้องกันการดึงข้อมูลทั้งตารางโดยไม่ตั้งใจ
    });

    return NextResponse.json({
      success: true,
      data: leaves,
      count: leaves.length,
    });

  } catch (error) {
    logger.error('Search leaves error', { error });
    return NextResponse.json(
      {
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'เกิดข้อผิดพลาดภายในระบบ',
      },
      { status: 500 }
    );
  }
}
