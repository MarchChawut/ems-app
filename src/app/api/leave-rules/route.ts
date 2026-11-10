/**
 * ==================================================
 * API Route: /api/leave-rules
 * ==================================================
 * API สำหรับจัดการกฎเกณฑ์การลา (CRUD operations)
 * รองรับกฎแยกตามปีงบประมาณ (fiscalYear) เนื่องจากเกณฑ์การลาเปลี่ยนแปลงในแต่ละปี
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth, isManagerOrAbove } from '@/lib/auth';
import { getFeatureSettings } from '@/lib/feature-settings-server';
import { logger } from '@/lib/logger';

const leaveRuleSchema = z.object({
  name: z.string().min(1, 'กรุณาระบุชื่อกฎ').max(100),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'รูปแบบเวลาต้องเป็น HH:mm').optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'รูปแบบเวลาต้องเป็น HH:mm').optional(),
  fullDayHours: z.number().positive().optional(),
  halfDayHours: z.number().positive().optional(),
  maxConsecutiveDays: z.number().int().positive().optional(),
  hourThreshold: z.number().positive().optional(),
  halfDayFraction: z.number().min(0).max(1).optional(),
  // ปี ค.ศ. ที่ปีงบประมาณเริ่มต้น (1 ต.ค.) - ต้องตรงกับ getFiscalYear() ใน src/lib/leave-calc.ts (ปี ค.ศ. ไม่ใช่ พ.ศ.)
  fiscalYear: z.number().int().min(2000).max(2100).nullable().optional(),
  isActive: z.boolean().optional(),
});

/**
 * GET /api/leave-rules
 * ดึงกฎเกณฑ์การลาทั้งหมด หรือกรองตามปีงบประมาณด้วย ?fiscalYear=
 */
/** เวลาทำการเริ่มต้นของกฎการลาใหม่ — จากการตั้งค่าฟีเจอร์ "การลา" (หน้าตั้งค่า > ฟีเจอร์ของระบบ) */
async function loadLeaveDefaults(): Promise<{ workStartTime: string; workEndTime: string }> {
  const cfg = (await getFeatureSettings()).leaves.config;
  return { workStartTime: String(cfg.workStartTime), workEndTime: String(cfg.workEndTime) };
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, error: authResult.error, message: authResult.message },
        { status: authResult.status }
      );
    }

    const { searchParams } = new URL(request.url);
    const fiscalYearParam = searchParams.get('fiscalYear');

    if (fiscalYearParam) {
      const fiscalYear = parseInt(fiscalYearParam);
      const rule = await prisma.leaveRule.findFirst({ where: { fiscalYear } });
      return NextResponse.json({ success: true, data: rule ? [rule] : [] });
    }

    const leaveDefaults = await loadLeaveDefaults();
    const rules = await prisma.leaveRule.findMany({
      orderBy: [{ fiscalYear: 'desc' }, { createdAt: 'desc' }],
    });

    // ถ้าไม่มีกฎ ให้สร้างกฎเริ่มต้น (fallback ไม่ผูกปีงบประมาณ)
    if (rules.length === 0) {
      const defaultRule = await prisma.leaveRule.create({
        data: {
          name: 'กฎการลามาตรฐาน',
          startTime: leaveDefaults.workStartTime,
          endTime: leaveDefaults.workEndTime,
          fullDayHours: 8,
          halfDayHours: 4,
          maxConsecutiveDays: 30,
          hourThreshold: 3,
          halfDayFraction: 0.5,
          fiscalYear: null,
          isActive: true,
        },
      });
      return NextResponse.json({
        success: true,
        data: [defaultRule],
      });
    }

    return NextResponse.json({
      success: true,
      data: rules,
    });

  } catch (error) {
    logger.error('Get leave rules error', { error });
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
 * POST /api/leave-rules
 * สร้างกฎเกณฑ์การลาใหม่ (เฉพาะ Manager ขึ้นไป) - เช่น กฎสำหรับปีงบประมาณใหม่
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, error: authResult.error, message: authResult.message },
        { status: authResult.status }
      );
    }

    const currentUser = authResult.user!;

    if (!isManagerOrAbove(currentUser.role)) {
      return NextResponse.json(
        {
          success: false,
          error: 'FORBIDDEN',
          message: 'คุณไม่มีสิทธิ์จัดการกฎการลา',
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validationResult = leaveRuleSchema.safeParse(body);

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

    const data = validationResult.data;

    if (data.fiscalYear != null) {
      const existing = await prisma.leaveRule.findFirst({ where: { fiscalYear: data.fiscalYear } });
      if (existing) {
        return NextResponse.json(
          {
            success: false,
            error: 'FISCAL_YEAR_EXISTS',
            message: `มีกฎสำหรับปีงบประมาณ ${data.fiscalYear} อยู่แล้ว`,
          },
          { status: 409 }
        );
      }
    }

    const leaveDefaults = await loadLeaveDefaults();
    const rule = await prisma.leaveRule.create({
      data: {
        name: data.name,
        startTime: data.startTime || leaveDefaults.workStartTime,
        endTime: data.endTime || leaveDefaults.workEndTime,
        fullDayHours: data.fullDayHours ?? 8,
        halfDayHours: data.halfDayHours ?? 4,
        maxConsecutiveDays: data.maxConsecutiveDays ?? 30,
        hourThreshold: data.hourThreshold ?? 3,
        halfDayFraction: data.halfDayFraction ?? 0.5,
        fiscalYear: data.fiscalYear ?? null,
        isActive: data.isActive ?? true,
      },
    });

    return NextResponse.json({
      success: true,
      data: rule,
      message: 'สร้างกฎการลาสำเร็จ',
    }, { status: 201 });

  } catch (error) {
    logger.error('Create leave rule error', { error });
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
 * PATCH /api/leave-rules
 * อัปเดตกฎเกณฑ์การลา (เฉพาะ Manager ขึ้นไป)
 */
export async function PATCH(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, error: authResult.error, message: authResult.message },
        { status: authResult.status }
      );
    }

    const currentUser = authResult.user!;

    if (!isManagerOrAbove(currentUser.role)) {
      return NextResponse.json(
        {
          success: false,
          error: 'FORBIDDEN',
          message: 'คุณไม่มีสิทธิ์จัดการกฎการลา',
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { id, ...updateData } = body;

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: 'INVALID_INPUT',
          message: 'กรุณาระบุ ID ของกฎการลา',
        },
        { status: 400 }
      );
    }

    const validationResult = leaveRuleSchema.partial().safeParse(updateData);
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

    if (validationResult.data.fiscalYear != null) {
      const existing = await prisma.leaveRule.findFirst({
        where: { fiscalYear: validationResult.data.fiscalYear, NOT: { id: parseInt(id) } },
      });
      if (existing) {
        return NextResponse.json(
          {
            success: false,
            error: 'FISCAL_YEAR_EXISTS',
            message: `มีกฎสำหรับปีงบประมาณ ${validationResult.data.fiscalYear} อยู่แล้ว`,
          },
          { status: 409 }
        );
      }
    }

    const rule = await prisma.leaveRule.update({
      where: { id: parseInt(id) },
      data: validationResult.data,
    });

    return NextResponse.json({
      success: true,
      data: rule,
      message: 'อัปเดตกฎการลาสำเร็จ',
    });

  } catch (error) {
    logger.error('Update leave rule error', { error });
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
