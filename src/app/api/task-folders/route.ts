/**
 * ==================================================
 * API Route: /api/task-folders
 * ==================================================
 * API สำหรับจัดการแฟ้มเก็บถาวรงาน (CRUD operations)
 * ใช้แยกหมวดหมู่งานที่เก็บถาวรแล้วในระบบ Kanban
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, requirePermission } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/permissions';
import { logger } from '@/lib/logger';
import { z } from 'zod';

// Schema สำหรับสร้างแฟ้ม
const createTaskFolderSchema = z.object({
  name: z.string().min(1, 'กรุณาระบุชื่อแฟ้ม').max(100, 'ชื่อแฟ้มต้องไม่เกิน 100 ตัวอักษร'),
  order: z.number().int().min(0).optional(),
});

/**
 * GET /api/task-folders
 * ดึงรายการแฟ้มทั้งหมด (ผู้ใช้ที่ login แล้วทุกคนดูได้ ใช้เลือกตอนเก็บถาวร/กรองดูงานเก็บถาวร)
 *
 * Response:
 * {
 *   success: true,
 *   data: TaskFolder[]
 * }
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

    const folders = await prisma.taskFolder.findMany({
      orderBy: { order: 'asc' },
    });

    return NextResponse.json({
      success: true,
      data: folders,
    });

  } catch (error) {
    logger.error('Get task folders error', { error });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/task-folders
 * สร้างแฟ้มใหม่ (เฉพาะผู้ที่มีสิทธิ์ tasks.manage_folders — ค่าเริ่มต้น ADMIN/SUPER_ADMIN เท่านั้น)
 *
 * Request Body:
 * {
 *   name: string;
 *   order?: number;
 * }
 *
 * Response:
 * {
 *   success: true,
 *   data: TaskFolder,
 *   message: 'สร้างแฟ้มสำเร็จ'
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, PERMISSIONS.TASKS_MANAGE_FOLDERS);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, error: authResult.error, message: authResult.message },
        { status: authResult.status }
      );
    }

    const body = await request.json();
    const validationResult = createTaskFolderSchema.safeParse(body);

    if (!validationResult.success) {
      const errors = validationResult.error.flatten().fieldErrors;
      return NextResponse.json(
        { success: false, error: 'VALIDATION_ERROR', message: 'ข้อมูลไม่ถูกต้อง', details: errors },
        { status: 400 }
      );
    }

    const { name, order } = validationResult.data;

    // หา order สูงสุดถ้าไม่ได้ระบุ
    let finalOrder = order;
    if (finalOrder === undefined) {
      const lastFolder = await prisma.taskFolder.findFirst({
        orderBy: { order: 'desc' },
      });
      finalOrder = (lastFolder?.order ?? -1) + 1;
    }

    const folder = await prisma.taskFolder.create({
      data: { name, order: finalOrder },
    });

    return NextResponse.json(
      { success: true, data: folder, message: 'สร้างแฟ้มสำเร็จ' },
      { status: 201 }
    );

  } catch (error) {
    logger.error('Create task folder error', { error });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      { status: 500 }
    );
  }
}
