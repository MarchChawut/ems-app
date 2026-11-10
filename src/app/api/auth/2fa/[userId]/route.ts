/**
 * ==================================================
 * API Route: DELETE /api/auth/2fa/[userId]
 * ==================================================
 * รีเซ็ต 2FA ของผู้ใช้ (สำหรับกรณีทำอุปกรณ์หาย) — เฉพาะ ADMIN/SUPER_ADMIN
 * หลังรีเซ็ต ผู้ใช้จะถูกบังคับให้ลงทะเบียน 2FA ใหม่ตอน login ครั้งถัดไป
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { canManageTarget } from '@/lib/user-policy';
import { requireAuth, isAdmin } from '@/lib/auth';
import { logger } from '@/lib/logger';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.success || !auth.user) {
      return NextResponse.json(
        { success: false, error: auth.error, message: auth.message },
        { status: auth.status ?? 401 }
      );
    }
    if (!isAdmin(auth.user.role)) {
      return NextResponse.json(
        { success: false, error: 'FORBIDDEN', message: 'ไม่มีสิทธิ์ดำเนินการ' },
        { status: 403 }
      );
    }

    const { userId } = await params;
    const targetId = Number(userId);
    if (!Number.isInteger(targetId) || targetId <= 0) {
      return NextResponse.json(
        { success: false, error: 'VALIDATION_ERROR', message: 'รหัสผู้ใช้ไม่ถูกต้อง' },
        { status: 400 }
      );
    }

    const target = await prisma.user.findUnique({ where: { id: targetId } });
    if (!target) {
      return NextResponse.json(
        { success: false, error: 'NOT_FOUND', message: 'ไม่พบผู้ใช้' },
        { status: 404 }
      );
    }

    // ADMIN รีเซ็ต 2FA ของบัญชีระดับ ADMIN/SUPER_ADMIN ไม่ได้ (เฉพาะ SUPER_ADMIN) — กันไม่ให้ปลดการป้องกันของผู้ดูแลระดับสูง
    if (auth.user.id !== target.id && !canManageTarget(auth.user.role, target.role)) {
      return NextResponse.json(
        { success: false, error: 'FORBIDDEN', message: 'คุณไม่มีสิทธิ์รีเซ็ต 2FA ของบัญชีระดับผู้ดูแลระบบ' },
        { status: 403 }
      );
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: targetId },
        data: { twoFactorEnabled: false, twoFactorSecret: null },
      }),
      prisma.twoFactorBackupCode.deleteMany({ where: { userId: targetId } }),
      // ตัด session เดิมทั้งหมดของผู้ใช้ที่ถูกรีเซ็ต (ผู้ใช้ต้องล็อกอินและตั้งค่า 2FA ใหม่)
      prisma.session.updateMany({ where: { userId: targetId }, data: { isValid: false } }),
    ]);

    logger.info('2FA reset by admin', { adminId: auth.user.id, targetId });

    return NextResponse.json({ success: true, message: 'รีเซ็ต 2FA สำเร็จ ผู้ใช้ต้องตั้งค่าใหม่ตอนเข้าสู่ระบบ' });
  } catch (error) {
    logger.error('2FA admin reset error', { error });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      { status: 500 }
    );
  }
}
