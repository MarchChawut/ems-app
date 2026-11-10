/**
 * ==================================================
 * API Route: /api/holidays
 * ==================================================
 * API สำหรับจัดการวันหยุดของหน่วยงาน (CRUD operations)
 * เฉพาะ Admin เท่านั้นที่สามารถเพิ่ม/ลบได้
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isManagerOrAbove } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const createHolidaySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'รูปแบบวันที่ไม่ถูกต้อง (YYYY-MM-DD)'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'รูปแบบวันที่ไม่ถูกต้อง (YYYY-MM-DD)').optional(),
  name: z.string().min(1, 'กรุณาระบุชื่อวันหยุด').max(200),
  description: z.string().max(500).optional(),
});

/**
 * GET /api/holidays
 * ดึงรายการวันหยุดทั้งหมด (สามารถกรองตามปีได้)
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

    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year');

    const where: any = { isActive: true };
    if (year) {
      where.year = parseInt(year);
    }

    const holidays = await prisma.holiday.findMany({
      where,
      orderBy: { date: 'asc' },
    });

    return NextResponse.json({
      success: true,
      data: holidays,
    });

  } catch (error) {
    logger.error('Get holidays error', { error });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/holidays
 * เพิ่มวันหยุดใหม่
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

    if (!isManagerOrAbove(authResult.user!.role)) {
      return NextResponse.json(
        { success: false, error: 'FORBIDDEN', message: 'คุณไม่มีสิทธิ์จัดการวันหยุด' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validationResult = createHolidaySchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'ข้อมูลไม่ถูกต้อง',
          details: validationResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { startDate, endDate, name, description } = validationResult.data;
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : new Date(startDate);

    // ตรวจสอบว่า endDate >= startDate
    if (end < start) {
      return NextResponse.json(
        { success: false, error: 'VALIDATION_ERROR', message: 'วันที่สิ้นสุดต้องไม่น้อยกว่าวันที่เริ่มต้น' },
        { status: 400 }
      );
    }

    // จำกัดไม่เกิน 30 วันต่อครั้ง
    const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    if (diffDays > 30) {
      return NextResponse.json(
        { success: false, error: 'VALIDATION_ERROR', message: 'เพิ่มวันหยุดได้ไม่เกิน 30 วันต่อครั้ง' },
        { status: 400 }
      );
    }

    // สร้างรายการวันหยุดทุกวันในช่วง
    const createdHolidays = [];
    const skippedDates = [];
    const current = new Date(start);

    while (current <= end) {
      const dateObj = new Date(current);
      const year = dateObj.getFullYear();

      // ตรวจสอบว่าวันหยุดซ้ำหรือไม่
      const existing = await prisma.holiday.findUnique({
        where: { date: dateObj },
      });

      if (existing) {
        skippedDates.push(dateObj.toISOString().split('T')[0]);
      } else {
        const holiday = await prisma.holiday.create({
          data: {
            date: dateObj,
            name,
            description: description || null,
            year,
          },
        });
        createdHolidays.push(holiday);
      }

      current.setDate(current.getDate() + 1);
    }

    const message = skippedDates.length > 0
      ? `เพิ่มวันหยุดสำเร็จ ${createdHolidays.length} วัน (ข้าม ${skippedDates.length} วันที่มีอยู่แล้ว)`
      : `เพิ่มวันหยุดสำเร็จ ${createdHolidays.length} วัน`;

    return NextResponse.json(
      { success: true, data: createdHolidays, message },
      { status: 201 }
    );

  } catch (error) {
    logger.error('Create holiday error', { error });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/holidays
 * ลบวันหยุด (ส่ง id ผ่าน query parameter)
 */
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, error: authResult.error, message: authResult.message },
        { status: authResult.status }
      );
    }

    if (!isManagerOrAbove(authResult.user!.role)) {
      return NextResponse.json(
        { success: false, error: 'FORBIDDEN', message: 'คุณไม่มีสิทธิ์จัดการวันหยุด' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'VALIDATION_ERROR', message: 'กรุณาระบุ ID วันหยุด' },
        { status: 400 }
      );
    }

    await prisma.holiday.delete({
      where: { id: parseInt(id) },
    });

    return NextResponse.json({
      success: true,
      message: 'ลบวันหยุดสำเร็จ',
    });

  } catch (error) {
    logger.error('Delete holiday error', { error });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      { status: 500 }
    );
  }
}
