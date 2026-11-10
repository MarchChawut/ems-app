/**
 * ==================================================
 * API Route: /api/columns/[id]
 * ==================================================
 * API สำหรับจัดการคอลัมน์เดี่ยว (อัปเดต, ลบ)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isBoardAdmin } from '@/lib/task-access';
import { requireAuth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { z } from 'zod';

// Schema สำหรับอัปเดตคอลัมน์
const updateColumnSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  color: z.string().optional(),
  order: z.number().int().min(0).optional(),
});

/**
 * PATCH /api/columns/[id]
 * อัปเดตข้อมูลคอลัมน์
 * 
 * Request Body:
 * {
 *   name?: string;
 *   color?: string;
 *   order?: number;
 * }
 * 
 * Response:
 * {
 *   success: true,
 *   data: Column,
 *   message: 'อัปเดตคอลัมน์สำเร็จ'
 * }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    // ตรวจสอบสิทธิ์
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

    const { id } = await params;
    const columnId = parseInt(id);

    if (isNaN(columnId)) {
      return NextResponse.json(
        {
          success: false,
          error: 'INVALID_ID',
          message: 'รหัสคอลัมน์ไม่ถูกต้อง',
        },
        { status: 400 }
      );
    }

    // ตรวจสอบว่าคอลัมน์มีอยู่หรือไม่
    const existingColumn = await prisma.kanbanColumn.findUnique({
      where: { id: columnId },
    });

    if (!existingColumn) {
      return NextResponse.json(
        {
          success: false,
          error: 'COLUMN_NOT_FOUND',
          message: 'ไม่พบคอลัมน์',
        },
        { status: 404 }
      );
    }

    // อ่านข้อมูลจาก request body
    const body = await request.json();

    // ตรวจสอบข้อมูลด้วย Zod Schema
    const validationResult = updateColumnSchema.safeParse(body);

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

    // สร้างข้อมูลสำหรับอัปเดต
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (color !== undefined) updateData.color = color;
    if (order !== undefined) updateData.order = order;

    // อัปเดตคอลัมน์
    const column = await prisma.kanbanColumn.update({
      where: { id: columnId },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      data: column,
      message: 'อัปเดตคอลัมน์สำเร็จ',
    });

  } catch (error) {
    logger.error('Update column error', { error });
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
 * DELETE /api/columns/[id]
 * ลบคอลัมน์
 * 
 * Response:
 * {
 *   success: true,
 *   message: 'ลบคอลัมน์สำเร็จ'
 * }
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    // ตรวจสอบสิทธิ์
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

    const { id } = await params;
    const columnId = parseInt(id);

    if (isNaN(columnId)) {
      return NextResponse.json(
        {
          success: false,
          error: 'INVALID_ID',
          message: 'รหัสคอลัมน์ไม่ถูกต้อง',
        },
        { status: 400 }
      );
    }

    // ตรวจสอบว่าคอลัมน์มีอยู่หรือไม่
    const existingColumn = await prisma.kanbanColumn.findUnique({
      where: { id: columnId },
    });

    if (!existingColumn) {
      return NextResponse.json(
        {
          success: false,
          error: 'COLUMN_NOT_FOUND',
          message: 'ไม่พบคอลัมน์',
        },
        { status: 404 }
      );
    }

    // ตรวจสอบว่ามีงานในคอลัมน์นี้หรือไม่
    const tasksInColumn = await prisma.task.count({
      where: { columnId: columnId },
    });

    if (tasksInColumn > 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'COLUMN_HAS_TASKS',
          message: `ไม่สามารถลบคอลัมน์นี้ได้ เนื่องจากมีงาน ${tasksInColumn} รายการอยู่ในคอลัมน์`,
        },
        { status: 400 }
      );
    }

    // ลบคอลัมน์
    await prisma.kanbanColumn.delete({
      where: { id: columnId },
    });

    return NextResponse.json({
      success: true,
      message: 'ลบคอลัมน์สำเร็จ',
    });

  } catch (error) {
    logger.error('Delete column error', { error });
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
