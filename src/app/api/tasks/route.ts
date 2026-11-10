/**
 * ==================================================
 * API Route: /api/tasks
 * ==================================================
 * API สำหรับจัดการงาน (CRUD operations)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createTaskSchema } from '@/lib/security';
import { canCreateInScope, parseTaskScope } from '@/lib/task-access';
import { requireAuth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { toSafeGregorianDate, computeTaskReminderSchedule } from '@/lib/utils';

/**
 * GET /api/tasks
 * ดึงรายการงานทั้งหมด
 * 
 * Query Parameters:
 * - columnId: กรองตามคอลัมน์
 * - priority: กรองตามความสำคัญ (LOW, MEDIUM, HIGH, URGENT)
 * - assigneeId: กรองตามผู้รับผิดชอบ
 * 
 * Response:
 * {
 *   success: true,
 *   data: Task[]
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
    const columnId = searchParams.get('columnId');
    const priority = searchParams.get('priority');
    const assigneeId = searchParams.get('assigneeId');
    const showArchived = searchParams.get('showArchived');

    // บอร์ดงาน 2 แบบ: scope=shared (ส่วนรวม ทุกคนเห็น) | scope=private (ส่วนตัว เห็นเฉพาะเจ้าของ)
    // ไม่มีทางดึงงานส่วนตัวของคนอื่นได้ ไม่ว่าจะส่ง query อะไรมา
    const scope = parseTaskScope(searchParams.get('scope'));

    // สร้าง where clause
    const where: any = {
      ownerId: scope === 'private' ? authResult.user!.id : null,
    };

    // ซ่อนงานที่เก็บถาวรโดยค่าเริ่มต้น
    if (showArchived !== 'true') {
      where.archivedAt = null;
    }

    if (columnId) {
      where.columnId = parseInt(columnId);
    }

    if (priority) {
      where.priority = priority;
    }

    if (assigneeId) {
      where.assigneeId = parseInt(assigneeId);
    }

    // ดึงข้อมูลงาน
    const tasks = await prisma.task.findMany({
      where,
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
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    return NextResponse.json({
      success: true,
      data: tasks,
    });

  } catch (error) {
    logger.error('Get tasks error', { error });
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
 * POST /api/tasks
 * สร้างงานใหม่
 * 
 * Request Body:
 * {
 *   title: string;
 *   description?: string;
 *   priority: Priority;
 *   columnId?: number;
 *   assigneeId?: number;
 * }
 * 
 * Response:
 * {
 *   success: true,
 *   data: Task,
 *   message: 'สร้างงานสำเร็จ'
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

    // อ่านข้อมูลจาก request body
    const body = await request.json();

    // ตรวจสอบข้อมูลด้วย Zod Schema
    const validationResult = createTaskSchema.safeParse(body);

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

    const { title, description, priority, columnId, reminderAt } = validationResult.data;
    let { assigneeId } = validationResult.data;

    // scope: private = งานส่วนตัวของผู้สร้าง / shared = งานส่วนรวม (เฉพาะ ADMIN และ SUPER_ADMIN)
    const scope = parseTaskScope((body as { scope?: string }).scope);
    if (!canCreateInScope(authResult.user!, scope)) {
      return NextResponse.json(
        { success: false, error: 'FORBIDDEN', message: 'เฉพาะผู้ดูแลระบบเท่านั้นที่เพิ่มงานส่วนรวมได้' },
        { status: 403 }
      );
    }
    // งานส่วนตัว: ผู้รับผิดชอบคือเจ้าของเองเสมอ (ไม่มอบให้คนอื่น — คนอื่นมองไม่เห็นงานนี้อยู่แล้ว)
    if (scope === 'private') assigneeId = authResult.user!.id;

    // ตรวจสอบว่าคอลัมน์มีอยู่หรือไม่ (ถ้าระบุ)
    if (columnId) {
      const column = await prisma.kanbanColumn.findUnique({
        where: { id: columnId },
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
    }

    // ตรวจสอบว่าผู้รับผิดชอบมีอยู่จริงหรือไม่ (ถ้าระบุ)
    if (assigneeId) {
      const assignee = await prisma.user.findUnique({
        where: { id: assigneeId },
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
    }

    // คำนวณวัน/เวลาแจ้งเตือนอัตโนมัติ (19:00 ก่อนวัน 1 วัน + 08:00 วันจริง) จากวันที่ของ reminderAt
    const safeReminderAt = reminderAt ? toSafeGregorianDate(reminderAt) : null;
    const autoSchedule = safeReminderAt ? computeTaskReminderSchedule(safeReminderAt) : null;

    // สร้างงานใหม่
    const task = await prisma.task.create({
      data: {
        title,
        description: description || null,
        priority,
        columnId: columnId || 1, // คอลัมน์แรกเป็นค่าเริ่มต้น
        assigneeId: assigneeId || null,
        ownerId: scope === 'private' ? authResult.user!.id : null,
        // งานส่วนตัวไม่ส่งแจ้งเตือนเข้ากลุ่ม LINE (จะเป็นการเปิดเผยงานส่วนตัวให้คนอื่นเห็น)
        reminderAt: scope === 'private' ? null : safeReminderAt,
        reminderDayBeforeAt: scope === 'private' ? null : (autoSchedule?.dayBeforeAt ?? null),
        reminderOnDayAt: scope === 'private' ? null : (autoSchedule?.onDayAt ?? null),
      },
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

    return NextResponse.json(
      {
        success: true,
        data: task,
        message: 'สร้างงานสำเร็จ',
      },
      { status: 201 }
    );

  } catch (error) {
    logger.error('Create task error', { error });
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
