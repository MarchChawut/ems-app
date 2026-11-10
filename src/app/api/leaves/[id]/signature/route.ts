/**
 * ==================================================
 * API Route: PATCH /api/leaves/[id]/signature
 * ==================================================
 * บันทึกตำแหน่ง/ขนาดลายเซ็นผู้ลาบนแบบฟอร์ม (Leave.signaturePlacement)
 * สิทธิ์ (ลายเซ็นคือการรับรองด้วยตนเอง):
 *  - วาง/ย้าย/ย่อขยาย (placement ไม่ใช่ null): เฉพาะ "เจ้าของใบลา" เท่านั้น
 *  - ซ่อน (placement = null): เจ้าของ หรือ MANAGER ขึ้นไป (admin ซ่อนได้ แต่วางแทนไม่ได้)
 * ทำได้ทุกสถานะ เพราะเป็นแค่การจัดวางตอนพิมพ์ ไม่ใช่การแก้ไขเนื้อหาใบลา
 *
 * Body: { placement: { x, y, width } | null }   (null = ซ่อนลายเซ็น)
 */

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAuth, isManagerOrAbove } from '@/lib/auth';
import { signaturePlacementSchema } from '@/lib/security';
import { logger } from '@/lib/logger';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth(request);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, error: authResult.error, message: authResult.message },
        { status: authResult.status }
      );
    }
    const currentUser = authResult.user!;

    const leaveId = parseInt((await params).id);
    if (!Number.isInteger(leaveId)) {
      return NextResponse.json(
        { success: false, error: 'INVALID_ID', message: 'รหัสการลาไม่ถูกต้อง' },
        { status: 400 }
      );
    }

    const leave = await prisma.leave.findUnique({
      where: { id: leaveId },
      select: { id: true, userId: true },
    });
    if (!leave) {
      return NextResponse.json(
        { success: false, error: 'LEAVE_NOT_FOUND', message: 'ไม่พบรายการลา' },
        { status: 404 }
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = signaturePlacementSchema.safeParse(body?.placement);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'VALIDATION_ERROR', message: 'ข้อมูลตำแหน่งลายเซ็นไม่ถูกต้อง' },
        { status: 400 }
      );
    }

    const isOwner = leave.userId === currentUser.id;
    const isHide = parsed.data === null;
    // วางได้เฉพาะเจ้าของ / ซ่อนได้เจ้าของหรือ MANAGER ขึ้นไป
    if (!isOwner && !(isHide && isManagerOrAbove(currentUser.role))) {
      return NextResponse.json(
        {
          success: false,
          error: 'FORBIDDEN',
          message: isHide
            ? 'คุณไม่มีสิทธิ์ซ่อนลายเซ็นของรายการลานี้'
            : 'เฉพาะเจ้าของใบลาเท่านั้นที่วางหรือย้ายลายเซ็นได้',
        },
        { status: 403 }
      );
    }

    const updated = await prisma.leave.update({
      where: { id: leaveId },
      data: { signaturePlacement: parsed.data ?? Prisma.DbNull },
      select: { signaturePlacement: true },
    });

    return NextResponse.json({
      success: true,
      data: { signaturePlacement: updated.signaturePlacement },
      message: 'บันทึกตำแหน่งลายเซ็นสำเร็จ',
    });
  } catch (error) {
    logger.error('Update signature placement error', { error });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      { status: 500 }
    );
  }
}
