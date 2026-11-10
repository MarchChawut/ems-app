/**
 * ==================================================
 * API Route: /api/tasks/[id]
 * ==================================================
 * API สำหรับจัดการงานเดี่ยว (อัปเดต, ลบ)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { canViewTask, canMutateTask } from '@/lib/task-access';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { toSafeGregorianDate, computeTaskReminderSchedule } from '@/lib/utils';


/**
 * Schema ของ PATCH /api/tasks/[id] — กรอง field ที่แก้ได้เท่านั้น (key อื่นถูกตัดทิ้ง เช่น ownerId แก้ผ่าน API นี้ไม่ได้)
 * ก่อนหน้านี้ไม่มีการตรวจ (body เป็น any) ทำให้ title ยาวเท่าไรก็ได้/ส่ง field แปลกปลอมเข้า DB ได้
 */
const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(255),
    description: z.string().max(5000).nullable(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
    columnId: z.number().int().positive(),
    assigneeId: z.number().int().positive().nullable(),
    reminderAt: z.string().max(64).nullable(),
    archivedAt: z.string().max(64).nullable(),
    folderId: z.number().int().positive().nullable(),
  })
  .partial();

/**
 * PATCH /api/tasks/[id]
 * อัปเดตข้อมูลงาน
 * 
 * Request Body:
 * {
 *   title?: string;
 *   description?: string;
 *   columnId?: number;
 *   priority?: Priority;
 *   assigneeId?: number | null;
 * }
 * 
 * Response:
 * {
 *   success: true,
 *   data: Task,
 *   message: 'อัปเดตงานสำเร็จ'
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

    const { id } = await params;
    const taskId = parseInt(id);

    if (isNaN(taskId)) {
      return NextResponse.json(
        {
          success: false,
          error: 'INVALID_ID',
          message: 'รหัสงานไม่ถูกต้อง',
        },
        { status: 400 }
      );
    }

    // ตรวจสอบว่างานมีอยู่หรือไม่
    const existingTask = await prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!existingTask) {
      return NextResponse.json(
        {
          success: false,
          error: 'TASK_NOT_FOUND',
          message: 'ไม่พบงาน',
        },
        { status: 404 }
      );
    }

    // งานส่วนตัวของคนอื่น: ตอบเหมือน "ไม่พบงาน" (ไม่เปิดเผยว่ามีอยู่); งานส่วนรวม: แก้ได้เฉพาะ ADMIN/SUPER_ADMIN
    if (!canViewTask(authResult.user!, existingTask)) {
      return NextResponse.json(
        { success: false, error: 'TASK_NOT_FOUND', message: 'ไม่พบงาน' },
        { status: 404 }
      );
    }
    if (!canMutateTask(authResult.user!, existingTask)) {
      return NextResponse.json(
        { success: false, error: 'FORBIDDEN', message: 'เฉพาะผู้ดูแลระบบเท่านั้นที่แก้ไขงานส่วนรวมได้' },
        { status: 403 }
      );
    }

    // อ่านข้อมูลจาก request body และกรองเฉพาะ field ที่อนุญาต
    const parsedBody = updateTaskSchema.safeParse(await request.json().catch(() => null));
    if (!parsedBody.success) {
      return NextResponse.json(
        { success: false, error: 'VALIDATION_ERROR', message: 'ข้อมูลไม่ถูกต้อง', details: parsedBody.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const body = parsedBody.data;

    // สร้างข้อมูลสำหรับอัปเดต
    const updateData: any = {};

    if (body.title !== undefined) {
      updateData.title = body.title;
    }

    if (body.description !== undefined) {
      updateData.description = body.description || null;
    }

    if (body.columnId !== undefined) {
      const column = await prisma.kanbanColumn.findUnique({
        where: { id: body.columnId },
      });

      if (!column) {
        return NextResponse.json(
          {
            success: false,
            error: 'COLUMN_NOT_FOUND',
            message: 'ไม่พบคอลัมน์',
          },
          { status: 404 }
        );
      }
      updateData.columnId = body.columnId;
    }

    if (body.priority !== undefined) {
      const validPriorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
      if (!validPriorities.includes(body.priority)) {
        return NextResponse.json(
          {
            success: false,
            error: 'INVALID_PRIORITY',
            message: 'ระดับความสำคัญไม่ถูกต้อง',
          },
          { status: 400 }
        );
      }
      updateData.priority = body.priority;
    }

    if (body.assigneeId !== undefined) {
      if (body.assigneeId === null) {
        updateData.assigneeId = null;
      } else {
        const assignee = await prisma.user.findUnique({
          where: { id: body.assigneeId },
        });

        if (!assignee) {
          return NextResponse.json(
            {
              success: false,
              error: 'ASSIGNEE_NOT_FOUND',
              message: 'ไม่พบผู้รับผิดชอบ',
            },
            { status: 404 }
          );
        }
        updateData.assigneeId = body.assigneeId;
      }
    }

    if (body.reminderAt !== undefined) {
      const safeReminderAt = body.reminderAt ? toSafeGregorianDate(body.reminderAt) : null;
      const autoSchedule = safeReminderAt ? computeTaskReminderSchedule(safeReminderAt) : null;

      updateData.reminderAt = safeReminderAt;
      updateData.reminderDayBeforeAt = autoSchedule?.dayBeforeAt ?? null;
      updateData.reminderOnDayAt = autoSchedule?.onDayAt ?? null;
      // ตั้งเวลาแจ้งเตือนใหม่ (หรือลบ) ทุกครั้ง ให้รีเซ็ตสถานะ "ส่งแล้ว" ทั้ง 3 แบบ เพื่อให้เวลาที่ตั้งใหม่ยังส่งแจ้งเตือนได้
      updateData.reminderSentAt = null;
      updateData.reminderDayBeforeSentAt = null;
      updateData.reminderOnDaySentAt = null;
    }

    if (body.archivedAt !== undefined) {
      updateData.archivedAt = body.archivedAt ? new Date(body.archivedAt) : null;
    }

    if (body.folderId !== undefined) {
      if (body.folderId === null) {
        updateData.folderId = null;
      } else {
        const folder = await prisma.taskFolder.findUnique({
          where: { id: body.folderId },
        });

        if (!folder) {
          return NextResponse.json(
            {
              success: false,
              error: 'FOLDER_NOT_FOUND',
              message: 'ไม่พบแฟ้ม',
            },
            { status: 404 }
          );
        }
        updateData.folderId = body.folderId;
      }
    }

    // งานส่วนตัว: มอบให้คนอื่น/เก็บเข้าแฟ้มส่วนกลาง/ตั้งแจ้งเตือนเข้ากลุ่ม LINE ไม่ได้ (จะทำให้คนอื่นเห็นงานส่วนตัว)
    if (existingTask.ownerId !== null) {
      updateData.assigneeId = existingTask.ownerId;
      delete updateData.folderId;
      delete updateData.reminderAt;
      delete updateData.reminderDayBeforeAt;
      delete updateData.reminderOnDayAt;
    }

    // อัปเดตงาน
    const task = await prisma.task.update({
      where: { id: taskId },
      data: updateData,
      include: {
        column: true,
        assignee: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
        folder: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: task,
      message: 'อัปเดตงานสำเร็จ',
    });

  } catch (error) {
    logger.error('Update task error', { error });
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
 * DELETE /api/tasks/[id]
 * ลบงาน
 * 
 * Response:
 * {
 *   success: true,
 *   message: 'ลบงานสำเร็จ'
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

    const { id } = await params;
    const taskId = parseInt(id);

    if (isNaN(taskId)) {
      return NextResponse.json(
        {
          success: false,
          error: 'INVALID_ID',
          message: 'รหัสงานไม่ถูกต้อง',
        },
        { status: 400 }
      );
    }

    // ตรวจสอบว่างานมีอยู่หรือไม่
    const existingTask = await prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!existingTask) {
      return NextResponse.json(
        {
          success: false,
          error: 'TASK_NOT_FOUND',
          message: 'ไม่พบงาน',
        },
        { status: 404 }
      );
    }

    // งานส่วนตัวของคนอื่น: ตอบเหมือน "ไม่พบงาน" (ไม่เปิดเผยว่ามีอยู่); งานส่วนรวม: แก้ได้เฉพาะ ADMIN/SUPER_ADMIN
    if (!canViewTask(authResult.user!, existingTask)) {
      return NextResponse.json(
        { success: false, error: 'TASK_NOT_FOUND', message: 'ไม่พบงาน' },
        { status: 404 }
      );
    }
    if (!canMutateTask(authResult.user!, existingTask)) {
      return NextResponse.json(
        { success: false, error: 'FORBIDDEN', message: 'เฉพาะผู้ดูแลระบบเท่านั้นที่แก้ไขงานส่วนรวมได้' },
        { status: 403 }
      );
    }

    // ลบงาน
    await prisma.task.delete({
      where: { id: taskId },
    });

    return NextResponse.json({
      success: true,
      message: 'ลบงานสำเร็จ',
    });

  } catch (error) {
    logger.error('Delete task error', { error });
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
