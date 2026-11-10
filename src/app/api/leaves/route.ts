/**
 * ==================================================
 * API Route: /api/leaves
 * ==================================================
 * API สำหรับจัดการรายการลา (CRUD operations)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createLeaveSchema } from '@/lib/security';
import { requireAuth, isManagerOrAbove } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { toSafeGregorianDate } from '@/lib/utils';
import { calculateLeaveDays } from '@/lib/leave-calc';
import { getEffectiveLeaveRule } from '@/lib/leave-rules-server';
import { parseLeaveTab } from '@/lib/leave-tabs';
import { buildLeaveTabWhere } from '@/lib/leave-tabs-server';
import { notifyLeaveStage } from '@/lib/leave-notifications';
import { getFeatureSettings } from '@/lib/feature-settings-server';
import { disabledLeaveTypeMessage } from '@/lib/leave-type-options';

/**
 * GET /api/leaves
 * ดึงรายการลาทั้งหมด
 * 
 * Query Parameters:
 * - status: กรองตามสถานะ (PENDING, APPROVED, REJECTED)
 * - type: กรองตามประเภท (SICK, PERSONAL, MATERNITY, OTHER, ...)
 * - userId: กรองตามผู้ใช้
 * - tab: กรองตามแท็บ (KBK, STATS, LATE_ARRIVAL) ดู src/lib/leave-tabs.ts
 * - page: หน้าที่ต้องการ (เริ่มที่ 1, ค่าเริ่มต้น 1)
 * - limit: จำนวนต่อหน้า (ค่าเริ่มต้น 50, สูงสุด 200)
 *
 * Response:
 * {
 *   success: true,
 *   data: Leave[],
 *   meta: { total, page, limit, hasMore }
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

    const currentUser = authResult.user!;

    // ดึง query parameters
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const type = searchParams.get('type');
    const userId = searchParams.get('userId');
    const tab = parseLeaveTab(searchParams.get('tab'));
    const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1);
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50') || 50));

    // สร้าง where clause
    const where: any = {};

    // ถ้าไม่ใช่ manager ขึ้นไป ให้เห็นเฉพาะรายการตัวเอง
    if (!isManagerOrAbove(currentUser.role)) {
      where.userId = currentUser.id;
    } else if (userId) {
      where.userId = parseInt(userId);
    }

    if (status) {
      where.status = status;
    }

    if (type) {
      where.type = type;
    }

    const tabWhere = buildLeaveTabWhere(tab);
    if (tabWhere.length) {
      where.AND = tabWhere;
    }

    // ดึงข้อมูลการลา (แบ่งหน้า)
    const [leaves, total] = await Promise.all([
      prisma.leave.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              prefix: true,
              name: true,
              avatar: true,
              department: true,
              division: true,
              position: true,
              phone: true,
              address: true,
              supervisorId: true,
              signatureFileId: true,
              role: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.leave.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: leaves,
      meta: { total, page, limit, hasMore: page * limit < total },
    });

  } catch (error) {
    logger.error('Get leaves error', { error });
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

/**
 * POST /api/leaves
 * สร้างรายการลาใหม่
 * 
 * Request Body:
 * {
 *   userId?: number; // สำหรับ MANAGER ขึ้นไปที่สร้างให้คนอื่น
 *   type: LeaveType;
 *   startDate: string; // YYYY-MM-DD
 *   endDate: string;   // YYYY-MM-DD
 *   reason: string;
 * }
 * 
 * Response:
 * {
 *   success: true,
 *   data: Leave,
 *   message: 'บันทึกการลาสำเร็จ'
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // ตรวจสอบการเข้าสู่ระบบ
    const authResult = await requireAuth(request);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, error: authResult.error, message: authResult.message },
        { status: authResult.status }
      );
    }

    const currentUser = authResult.user!;

    // อ่านข้อมูลจาก request body
    const body = await request.json();

    // ตรวจสอบข้อมูลด้วย Zod Schema
    const validationResult = createLeaveSchema.safeParse(body);

    if (!validationResult.success) {
      const errors = validationResult.error.flatten().fieldErrors;
      return NextResponse.json(
        {
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'ข้อมูลไม่ถูกต้อง',
          details: errors,
        },
        { status: 400 }
      );
    }

    const { type, startDate, endDate, reason, isHalfDay, hours, outTime, backTime, formCategory, contactAddress } = validationResult.data;

    // ใบมาสาย/ออกก่อนเวลาที่แอดมินปิดไว้ (หน้าตั้งค่า > ฟีเจอร์ของระบบ > การลา) สร้างใหม่ไม่ได้
    {
      const disabledMessage = disabledLeaveTypeMessage(type, await getFeatureSettings());
      if (disabledMessage) {
        return NextResponse.json({ success: false, error: 'FEATURE_DISABLED', message: disabledMessage }, { status: 403 });
      }
    }

    // กำหนด userId สำหรับการลา
    let targetUserId = currentUser.id;
    
    // ถ้าระบุ userId และเป็น MANAGER ขึ้นไป ให้ใช้ userId นั้น
    if (body.userId && isManagerOrAbove(currentUser.role)) {
      // ตรวจสอบว่าผู้ใช้มีอยู่จริง
      const targetUser = await prisma.user.findUnique({
        where: { id: body.userId },
      });
      
      if (!targetUser) {
        return NextResponse.json(
          {
            success: false,
            error: 'USER_NOT_FOUND',
            message: 'ไม่พบผู้ใช้ที่ระบุ',
          },
          { status: 404 }
        );
      }
      
      targetUserId = body.userId;
    }

    // คำนวณจำนวนวันลา (ไม่นับเสาร์-อาทิตย์ และวันหยุดที่ admin กำหนด)
    // ใช้กฎการลาที่มีผลกับปีงบประมาณของ startDate (ปรับได้ต่อปีในหน้าตั้งค่า)
    const start = toSafeGregorianDate(startDate);
    const end = toSafeGregorianDate(endDate);

    let holidays: { date: Date }[] = [];
    try {
      const holidayRecords = await prisma.holiday.findMany({
        where: {
          isActive: true,
          date: { gte: start, lte: end },
        },
        select: { date: true },
      });
      holidays = holidayRecords;
    } catch {
      // ถ้ายังไม่มีตาราง holiday ให้ข้ามไป
    }

    const leaveRule = await getEffectiveLeaveRule(start);
    const totalDays = calculateLeaveDays(start, end, isHalfDay ?? false, hours, holidays, leaveRule);

    // สร้างรายการลาใหม่
    const leave = await prisma.leave.create({
      data: {
        userId: targetUserId,
        type,
        startDate: toSafeGregorianDate(startDate),
        endDate: toSafeGregorianDate(endDate),
        reason,
        status: 'PENDING',
        isHalfDay: isHalfDay || false,
        hours: hours || null,
        outTime: outTime || null,
        backTime: backTime || null,
        formCategory: formCategory || null,
        totalDays,
        contactAddress: contactAddress || null,
      },
      include: {
        user: {
          select: {
            id: true,
            prefix: true,
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
    });

    // แจ้งเตือนเข้ากลุ่ม LINE ว่ามีการเปิดคำขอลาใหม่ - ระบุชื่อ "เจ้าของใบลา" เสมอ
    // (ไม่ใช่ผู้กดสร้าง เพราะ admin อาจยื่นแทนพนักงานคนอื่นได้ผ่าน targetUserId)
    // ไม่ await - ไม่ควรทำให้การสร้างคำขอลาช้าลงเพราะรอ fetch ภายนอก
    void notifyLeaveStage({ kind: 'OPENED', leave }).catch((error) => {
      logger.error('notifyLeaveStage failed', { error });
    });

    return NextResponse.json(
      {
        success: true,
        data: leave,
        message: 'บันทึกการลาสำเร็จ',
      },
      { status: 201 }
    );

  } catch (error) {
    logger.error('Create leave error', { error });
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
