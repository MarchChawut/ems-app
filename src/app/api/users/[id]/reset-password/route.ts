/**
 * ==================================================
 * API Route: /api/users/[id]/reset-password
 * ==================================================
 * ให้ Super Admin ตั้งรหัสผ่านใหม่ให้ผู้ใช้คนอื่น (ไม่ต้องรู้รหัสผ่านเดิม)
 * เมื่อรีเซ็ตสำเร็จ session เดิมทั้งหมดของผู้ใช้คนนั้นจะถูกตัดทิ้ง
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword, resetPasswordSchema } from '@/lib/security';
import { requireAuth, isAdmin } from '@/lib/auth';
import { canManageTarget } from '@/lib/user-policy';
import { initialSetupFlags } from '@/lib/security-setup';
import { logger } from '@/lib/logger';

/**
 * POST /api/users/[id]/reset-password
 * รีเซ็ตรหัสผ่านผู้ใช้ (เฉพาะ Super Admin เท่านั้น)
 *
 * Body: { password: string; confirmPassword: string }
 * Response:
 * {
 *   success: true,
 *   message: 'รีเซ็ตรหัสผ่านสำเร็จ'
 * }
 */
export async function POST(
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

    const currentUser = authResult.user!;
    const { id } = await params;
    const userId = parseInt(id);

    if (isNaN(userId)) {
      return NextResponse.json(
        {
          success: false,
          error: 'INVALID_ID',
          message: 'รหัสผู้ใช้ไม่ถูกต้อง',
        },
        { status: 400 }
      );
    }

    // ตรวจสอบสิทธิ์: เฉพาะ ADMIN และ SUPER_ADMIN (ADMIN รีเซ็ตได้เฉพาะบัญชีที่ไม่ใช่ ADMIN/SUPER_ADMIN — ตรวจต่อหลังโหลดผู้ใช้เป้าหมาย)
    if (!isAdmin(currentUser.role)) {
      return NextResponse.json(
        {
          success: false,
          error: 'FORBIDDEN',
          message: 'คุณไม่มีสิทธิ์รีเซ็ตรหัสผ่านผู้ใช้',
        },
        { status: 403 }
      );
    }

    // ไม่สามารถรีเซ็ตรหัสผ่านตัวเองผ่านช่องทางนี้ได้ (ใช้หน้า "เปลี่ยนรหัสผ่าน" แทน)
    if (currentUser.id === userId) {
      return NextResponse.json(
        {
          success: false,
          error: 'CANNOT_RESET_OWN_PASSWORD',
          message: 'ไม่สามารถรีเซ็ตรหัสผ่านตัวเองได้ทางนี้ กรุณาใช้หัวข้อ "เปลี่ยนรหัสผ่าน" แทน',
        },
        { status: 400 }
      );
    }

    // ตรวจสอบว่าผู้ใช้มีอยู่หรือไม่
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, name: true, role: true, _count: { select: { authenticators: true } } },
    });

    if (!existingUser) {
      return NextResponse.json(
        {
          success: false,
          error: 'USER_NOT_FOUND',
          message: 'ไม่พบผู้ใช้',
        },
        { status: 404 }
      );
    }

    // ADMIN รีเซ็ตรหัสผ่านบัญชีระดับ ADMIN/SUPER_ADMIN ไม่ได้ (กันยึดบัญชีผู้ดูแลระดับสูง)
    if (!canManageTarget(currentUser.role, existingUser.role)) {
      return NextResponse.json(
        { success: false, error: 'FORBIDDEN', message: 'เฉพาะ Super Admin เท่านั้นที่รีเซ็ตรหัสผ่านบัญชีผู้ดูแลระบบได้' },
        { status: 403 }
      );
    }

    // อ่านและตรวจสอบข้อมูลจาก request body
    const body = await request.json();
    const validationResult = resetPasswordSchema.safeParse(body);

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

    const hashedPassword = await hashPassword(validationResult.data.password);

    // ตั้งรหัสผ่านใหม่ และตัด session เดิมทั้งหมดของผู้ใช้คนนี้ในคราวเดียวกัน
    // รหัสผ่านที่แอดมินตั้งให้เป็นรหัสชั่วคราว: ผู้ใช้ต้องเปลี่ยนเองตอนล็อกอินครั้งถัดไป (และต้องมี passkey ถ้ายังไม่มี)
    // และต้องทำภายในอายุรหัสชั่วคราว ไม่งั้นล็อกอินไม่ได้จนกว่าจะรีเซ็ตใหม่
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: {
          password: hashedPassword,
          ...initialSetupFlags({ hasPasskey: existingUser._count.authenticators > 0 }),
        },
      }),
      prisma.session.updateMany({
        where: { userId, isValid: true },
        data: { isValid: false },
      }),
    ]);

    logger.info('Password reset by admin', {
      actorId: currentUser.id,
      targetUserId: userId,
      targetUsername: existingUser.username,
    });

    return NextResponse.json({
      success: true,
      message: 'รีเซ็ตรหัสผ่านสำเร็จ',
    });

  } catch (error) {
    logger.error('Reset password error', { error });
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
