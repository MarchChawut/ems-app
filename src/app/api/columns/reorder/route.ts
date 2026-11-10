/**
 * ==================================================
 * API Route: POST /api/columns/reorder
 * ==================================================
 * API สำหรับย้ายลำดับคอลัมน์ (Drag & Drop reorder)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isBoardAdmin } from '@/lib/task-access';
import { requireAuth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { z } from 'zod';

// Schema สำหรับตรวจสอบข้อมูล
const reorderSchema = z.object({
  columnIds: z.array(z.number().int().positive()).min(1),
});

/**
 * POST /api/columns/reorder
 * ย้ายลำดับคอลัมน์
 * 
 * Request Body:
 * {
 *   columnIds: number[] // ลำดับ ID ของคอลัมน์ใหม่
 * }
 * 
 * Response:
 * {
 *   success: true,
 *   message: 'จัดเรียงคอลัมน์สำเร็จ'
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

    // คอลัมน์ของบอร์ดเป็นของส่วนกลาง: เพิ่ม/แก้ไข/ลบ/จัดเรียงได้เฉพาะ ADMIN และ SUPER_ADMIN
    if (!isBoardAdmin(authResult.user!.role)) {
      return NextResponse.json(
        { success: false, error: 'FORBIDDEN', message: 'เฉพาะผู้ดูแลระบบเท่านั้นที่จัดการคอลัมน์ได้' },
        { status: 403 }
      );
    }

    // ตรวจสอบสิทธิ์ (เฉพาะ ADMIN, SUPER_ADMIN, MANAGER)
    if (!['ADMIN', 'SUPER_ADMIN', 'MANAGER'].includes(authResult.user!.role)) {
      return NextResponse.json(
        {
          success: false,
          error: 'FORBIDDEN',
          message: 'คุณไม่มีสิทธิ์จัดเรียงคอลัมน์',
        },
        { status: 403 }
      );
    }

    // อ่านข้อมูลจาก request body
    const body = await request.json();

    // ตรวจสอบข้อมูลด้วย Zod Schema
    const validationResult = reorderSchema.safeParse(body);

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

    const { columnIds } = validationResult.data;

    // ตรวจสอบว่าคอลัมน์ทั้งหมดมีอยู่จริง
    const existingColumns = await prisma.kanbanColumn.findMany({
      where: {
        id: { in: columnIds },
      },
    });

    if (existingColumns.length !== columnIds.length) {
      return NextResponse.json(
        {
          success: false,
          error: 'INVALID_COLUMNS',
          message: 'มีคอลัมน์บางรายการที่ไม่พบในระบบ',
        },
        { status: 400 }
      );
    }

    // อัปเดตลำดับของแต่ละคอลัมน์
    const updates = columnIds.map((id, index) =>
      prisma.kanbanColumn.update({
        where: { id },
        data: { order: index },
      })
    );

    await prisma.$transaction(updates);

    return NextResponse.json({
      success: true,
      message: 'จัดเรียงคอลัมน์สำเร็จ',
    });

  } catch (error) {
    logger.error('Reorder columns error', { error });
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
