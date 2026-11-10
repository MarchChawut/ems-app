/**
 * ==================================================
 * API Route: /api/task-folders/[id]
 * ==================================================
 * API สำหรับจัดการแฟ้มเก็บถาวรงานเดี่ยว (เปลี่ยนชื่อ, ลบ)
 * เฉพาะผู้ที่มีสิทธิ์ tasks.manage_folders — ค่าเริ่มต้น ADMIN/SUPER_ADMIN เท่านั้น
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/permissions';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const updateTaskFolderSchema = z.object({
  name: z.string().min(1, 'กรุณาระบุชื่อแฟ้ม').max(100).optional(),
  order: z.number().int().min(0).optional(),
});

/**
 * PATCH /api/task-folders/[id]
 * แก้ไขชื่อ/ลำดับแฟ้ม
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requirePermission(request, PERMISSIONS.TASKS_MANAGE_FOLDERS);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, error: authResult.error, message: authResult.message },
        { status: authResult.status }
      );
    }

    const { id } = await params;
    const folderId = parseInt(id);

    if (isNaN(folderId)) {
      return NextResponse.json(
        { success: false, error: 'INVALID_ID', message: 'รหัสแฟ้มไม่ถูกต้อง' },
        { status: 400 }
      );
    }

    const existingFolder = await prisma.taskFolder.findUnique({ where: { id: folderId } });
    if (!existingFolder) {
      return NextResponse.json(
        { success: false, error: 'FOLDER_NOT_FOUND', message: 'ไม่พบแฟ้ม' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const validationResult = updateTaskFolderSchema.safeParse(body);

    if (!validationResult.success) {
      const errors = validationResult.error.flatten().fieldErrors;
      return NextResponse.json(
        { success: false, error: 'VALIDATION_ERROR', message: 'ข้อมูลไม่ถูกต้อง', details: errors },
        { status: 400 }
      );
    }

    const folder = await prisma.taskFolder.update({
      where: { id: folderId },
      data: validationResult.data,
    });

    return NextResponse.json({ success: true, data: folder, message: 'แก้ไขแฟ้มสำเร็จ' });

  } catch (error) {
    logger.error('Update task folder error', { error });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/task-folders/[id]
 * ลบแฟ้ม (งานที่เคยเก็บไว้ในแฟ้มนี้จะกลายเป็นไม่มีแฟ้ม ไม่ถูกลบตาม เพราะ onDelete: SetNull)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requirePermission(request, PERMISSIONS.TASKS_MANAGE_FOLDERS);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, error: authResult.error, message: authResult.message },
        { status: authResult.status }
      );
    }

    const { id } = await params;
    const folderId = parseInt(id);

    if (isNaN(folderId)) {
      return NextResponse.json(
        { success: false, error: 'INVALID_ID', message: 'รหัสแฟ้มไม่ถูกต้อง' },
        { status: 400 }
      );
    }

    const existingFolder = await prisma.taskFolder.findUnique({ where: { id: folderId } });
    if (!existingFolder) {
      return NextResponse.json(
        { success: false, error: 'FOLDER_NOT_FOUND', message: 'ไม่พบแฟ้ม' },
        { status: 404 }
      );
    }

    await prisma.taskFolder.delete({ where: { id: folderId } });

    return NextResponse.json({ success: true, message: 'ลบแฟ้มสำเร็จ' });

  } catch (error) {
    logger.error('Delete task folder error', { error });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      { status: 500 }
    );
  }
}
