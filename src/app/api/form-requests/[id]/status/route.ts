/**
 * ==================================================
 * API Route: /api/form-requests/[id]/status
 * ==================================================
 * PATCH เปลี่ยนสถานะแบบฟอร์ม (อนุมัติ/ไม่อนุมัติ) - แยกจาก PATCH .../[id] (แก้ไขข้อมูลฟอร์ม, admin เท่านั้น)
 * เพราะ semantics ต่างกัน: อันนี้คือ manager/ผู้มีสิทธิ์ forms.approve พิจารณาคำขอ
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isManagerOrAbove } from '@/lib/auth';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';
import { logger } from '@/lib/logger';

const INCLUDE_REQUESTER_AND_TEMPLATE = {
  requestedBy: { select: { id: true, prefix: true, name: true, position: true, department: true, division: true, avatar: true, signatureFileId: true } },
  template: { include: { fields: { orderBy: { order: 'asc' as const } } } },
} as const;

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
    if (!isManagerOrAbove(currentUser.role) && !hasPermission(currentUser, PERMISSIONS.FORMS_APPROVE)) {
      return NextResponse.json(
        { success: false, error: 'FORBIDDEN', message: 'คุณไม่มีสิทธิ์พิจารณาแบบฟอร์มนี้' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const formRequestId = parseInt(id);
    if (isNaN(formRequestId)) {
      return NextResponse.json(
        { success: false, error: 'INVALID_ID', message: 'รหัสแบบฟอร์มไม่ถูกต้อง' },
        { status: 400 }
      );
    }

    const existing = await prisma.formRequest.findUnique({ where: { id: formRequestId } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'NOT_FOUND', message: 'ไม่พบแบบฟอร์ม' },
        { status: 404 }
      );
    }

    // ห้ามอนุมัติคำขอของตัวเอง แม้จะเป็น manager หรือได้สิทธิ์ forms.approve ก็ตาม
    if (existing.requestedById === currentUser.id) {
      return NextResponse.json(
        { success: false, error: 'SELF_APPROVAL_FORBIDDEN', message: 'ไม่สามารถอนุมัติคำขอของตัวเองได้' },
        { status: 403 }
      );
    }

    if (existing.status === null) {
      return NextResponse.json(
        { success: false, error: 'NO_WORKFLOW', message: 'แบบฟอร์มนี้ไม่มี workflow อนุมัติ' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const validStatuses = ['APPROVED', 'REJECTED'];
    if (!validStatuses.includes(body.status)) {
      return NextResponse.json(
        { success: false, error: 'INVALID_STATUS', message: 'สถานะไม่ถูกต้อง' },
        { status: 400 }
      );
    }

    // เงื่อนไข status: 'PENDING' อยู่ใน WHERE เดียวกับ UPDATE ทำให้การเช็ค+เขียนเป็น atomic
    // กันสองคนอนุมัติ/ปฏิเสธคำขอเดียวกันพร้อมกันแล้วเขียนทับกันเงียบๆ
    const { count } = await prisma.formRequest.updateMany({
      where: { id: formRequestId, status: 'PENDING' },
      data: {
        status: body.status,
        approvedBy: currentUser.id,
        approvedAt: new Date(),
      },
    });

    if (count === 0) {
      return NextResponse.json(
        { success: false, error: 'ALREADY_PROCESSED', message: 'แบบฟอร์มนี้ได้รับการพิจารณาแล้ว' },
        { status: 400 }
      );
    }

    const formRequest = await prisma.formRequest.findUniqueOrThrow({
      where: { id: formRequestId },
      include: INCLUDE_REQUESTER_AND_TEMPLATE,
    });

    const message = body.status === 'APPROVED' ? 'อนุมัติแบบฟอร์มสำเร็จ' : 'ปฏิเสธแบบฟอร์มสำเร็จ';

    return NextResponse.json({ success: true, data: formRequest, message });
  } catch (error) {
    logger.error('Update form request status error', { error });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      { status: 500 }
    );
  }
}
