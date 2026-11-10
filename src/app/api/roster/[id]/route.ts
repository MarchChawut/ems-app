/**
 * ==================================================
 * API Route: /api/roster/[id]
 * ==================================================
 * PUT    แก้ไขงานในตารางเวรทีละแถว (เฉพาะผู้มีสิทธิ์ roster.manage)
 * DELETE ลบงานในตารางเวร (เฉพาะผู้มีสิทธิ์ roster.manage)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/permissions';
import { updateRosterSchema } from '@/lib/security';
import { logger } from '@/lib/logger';

type RouteContext = { params: Promise<{ id: string }> };

const INTERNAL_ERROR = {
  success: false,
  error: 'INTERNAL_ERROR',
  message: 'เกิดข้อผิดพลาดภายในระบบ',
};

async function parseId(context: RouteContext): Promise<number | null> {
  const id = parseInt((await context.params).id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const authResult = await requirePermission(request, PERMISSIONS.ROSTER_MANAGE);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, error: authResult.error, message: authResult.message },
        { status: authResult.status }
      );
    }

    const id = await parseId(context);
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'INVALID_ID', message: 'รหัสไม่ถูกต้อง' },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = updateRosterSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'ข้อมูลไม่ถูกต้อง',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const existing = await prisma.rosterAssignment.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'NOT_FOUND', message: 'ไม่พบรายการนี้' },
        { status: 404 }
      );
    }

    const { startDate, endDate, userId, ...fields } = parsed.data;

    if (userId !== undefined) {
      const target = await prisma.user.count({ where: { id: userId, isActive: true } });
      if (!target) {
        return NextResponse.json(
          { success: false, error: 'USER_NOT_FOUND', message: 'ไม่พบผู้ปฏิบัติงานหรือถูกปิดใช้งาน' },
          { status: 400 }
        );
      }
    }

    const updated = await prisma.rosterAssignment.update({
      where: { id },
      data: {
        ...fields,
        location: fields.location || null,
        startTime: fields.startTime || null,
        endTime: fields.endTime || null,
        note: fields.note || null,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        ...(userId !== undefined ? { userId } : {}),
      },
    });

    return NextResponse.json({ success: true, data: updated, message: 'แก้ไขงานสำเร็จ' });
  } catch (error) {
    logger.error('Update roster error', { error });
    return NextResponse.json(INTERNAL_ERROR, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const authResult = await requirePermission(request, PERMISSIONS.ROSTER_MANAGE);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, error: authResult.error, message: authResult.message },
        { status: authResult.status }
      );
    }

    const id = await parseId(context);
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'INVALID_ID', message: 'รหัสไม่ถูกต้อง' },
        { status: 400 }
      );
    }

    const existing = await prisma.rosterAssignment.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'NOT_FOUND', message: 'ไม่พบรายการนี้' },
        { status: 404 }
      );
    }

    await prisma.rosterAssignment.delete({ where: { id } });
    logger.info('Roster assignment deleted', { id, by: authResult.user!.id });

    return NextResponse.json({ success: true, message: 'ลบงานสำเร็จ' });
  } catch (error) {
    logger.error('Delete roster error', { error });
    return NextResponse.json(INTERNAL_ERROR, { status: 500 });
  }
}
