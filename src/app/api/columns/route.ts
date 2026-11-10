/**
 * ==================================================
 * API Route: /api/columns
 * ==================================================
 * API สำหรับจัดการคอลัมน์ Kanban (CRUD operations)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isBoardAdmin } from '@/lib/task-access';
import { requireAuth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { z } from 'zod';

// Schema สำหรับสร้างคอลัมน์
const createColumnSchema = z.object({
  name: z.string().min(1, 'กรุณาระบุชื่อคอลัมน์').max(50, 'ชื่อคอลัมน์ต้องไม่เกิน 50 ตัวอักษร'),
  color: z.string().optional(),
  order: z.number().int().min(0).optional(),
});

/**
 * GET /api/columns
 * ดึงรายการคอลัมน์ทั้งหมด
 * 
 * Response:
 * {
 *   success: true,
 *   data: Column[]
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

    // ดึงข้อมูลคอลัมน์
    const columns = await prisma.kanbanColumn.findMany({
      orderBy: { order: 'asc' },
    });

    return NextResponse.json({
      success: true,
      data: columns,
    });

  } catch (error) {
    logger.error('Get columns error', { error });
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
 * POST /api/columns
 * สร้างคอลัมน์ใหม่
 * 
 * Request Body:
 * {
 *   name: string;
 *   color?: string;
 *   order?: number;
 * }
 * 
 * Response:
 * {
 *   success: true,
 *   data: Column,
 *   message: 'สร้างคอลัมน์สำเร็จ'
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

    // ตรวจสอบสิทธิ์ (เฉพาะ ADMIN และ MANAGER ขึ้นไป)
    if (!['ADMIN', 'SUPER_ADMIN', 'MANAGER'].includes(authResult.user!.role)) {
      return NextResponse.json(
        {
          success: false,
          error: 'FORBIDDEN',
          message: 'คุณไม่มีสิทธิ์จัดการคอลัมน์',
        },
        { status: 403 }
      );
    }

    // อ่านข้อมูลจาก request body
    const body = await request.json();

    // ตรวจสอบข้อมูลด้วย Zod Schema
    const validationResult = createColumnSchema.safeParse(body);

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

    const { name, color, order } = validationResult.data;

    // หา order สูงสุดถ้าไม่ได้ระบุ
    let finalOrder = order;
    if (finalOrder === undefined) {
      const lastColumn = await prisma.kanbanColumn.findFirst({
        orderBy: { order: 'desc' },
      });
      finalOrder = (lastColumn?.order ?? -1) + 1;
    }

    // สร้างคอลัมน์ใหม่
    const column = await prisma.kanbanColumn.create({
      data: {
        name,
        color: color || 'slate',
        order: finalOrder,
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: column,
        message: 'สร้างคอลัมน์สำเร็จ',
      },
      { status: 201 }
    );

  } catch (error) {
    logger.error('Create column error', { error });
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
