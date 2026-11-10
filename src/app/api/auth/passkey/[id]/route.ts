/**
 * ==================================================
 * API Route: DELETE /api/auth/passkey/[id]
 * ==================================================
 * ลบ passkey ของผู้ใช้ปัจจุบัน (ลบได้เฉพาะ passkey ที่ตัวเองเป็นเจ้าของ)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { logger } from '@/lib/logger';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.success || !auth.user) {
      return NextResponse.json(
        { success: false, error: auth.error, message: auth.message },
        { status: auth.status ?? 401 }
      );
    }

    const { id } = await params;
    const passkeyId = Number(id);
    if (!Number.isInteger(passkeyId) || passkeyId <= 0) {
      return NextResponse.json(
        { success: false, error: 'VALIDATION_ERROR', message: 'รหัส passkey ไม่ถูกต้อง' },
        { status: 400 }
      );
    }

    // ตรวจสอบความเป็นเจ้าของก่อนลบ
    const passkey = await prisma.authenticator.findUnique({ where: { id: passkeyId } });
    if (!passkey || passkey.userId !== auth.user.id) {
      return NextResponse.json(
        { success: false, error: 'NOT_FOUND', message: 'ไม่พบ passkey นี้' },
        { status: 404 }
      );
    }

    await prisma.authenticator.delete({ where: { id: passkeyId } });

    logger.info('Passkey deleted', { userId: auth.user.id, passkeyId });

    return NextResponse.json({ success: true, message: 'ลบ passkey สำเร็จ' });
  } catch (error) {
    logger.error('Passkey delete error', { error });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      { status: 500 }
    );
  }
}
