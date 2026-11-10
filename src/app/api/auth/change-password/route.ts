/**
 * ==================================================
 * API Route: POST /api/auth/change-password
 * ==================================================
 * เปลี่ยนรหัสผ่านของตนเอง (ต้องกรอกรหัสผ่านเดิมเพื่อยืนยัน)
 * ใช้ได้ทั้งพนักงานและผู้ดูแลระบบทุกระดับ
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { changePasswordSchema, hashPassword, verifyPassword, hashSessionToken } from '@/lib/security';
import { isPasskeyEnforceable } from '@/lib/security-setup';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, error: authResult.error, message: authResult.message },
        { status: authResult.status }
      );
    }

    const currentUser = authResult.user!;

    const body = await request.json();
    const validationResult = changePasswordSchema.safeParse(body);

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

    const { currentPassword, newPassword } = validationResult.data;

    const user = await prisma.user.findUnique({ where: { id: currentUser.id } });
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'USER_NOT_FOUND', message: 'ไม่พบผู้ใช้' },
        { status: 404 }
      );
    }

    const isCurrentPasswordValid = await verifyPassword(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      return NextResponse.json(
        {
          success: false,
          error: 'INVALID_CURRENT_PASSWORD',
          message: 'รหัสผ่านเดิมไม่ถูกต้อง',
        },
        { status: 401 }
      );
    }

    // รหัสใหม่ต้องไม่ซ้ำรหัสเดิม และไม่ใช่รหัสเริ่มต้นที่รู้กันทั่วไป (บัญชีที่นำเข้าจากไฟล์เริ่มด้วย password123)
    if (newPassword === currentPassword || newPassword.toLowerCase() === 'password123') {
      return NextResponse.json(
        {
          success: false,
          error: 'PASSWORD_NOT_ALLOWED',
          message: 'รหัสผ่านใหม่ต้องไม่ซ้ำรหัสผ่านเดิม และต้องไม่ใช่รหัสผ่านเริ่มต้น',
        },
        { status: 400 }
      );
    }

    const hashedPassword = await hashPassword(newPassword);

    // เปลี่ยนรหัสเองสำเร็จ = พ้นสถานะ "ต้องเปลี่ยนรหัสผ่าน"; ถ้าระบบนี้ใช้ passkey ไม่ได้ (เช่น เปิดผ่าน http://IP) ถือว่าขั้น passkey เสร็จ
    // (ไม่งั้นผู้ใช้ติดค้าง) — ถ้าใช้ได้ ผู้ใช้ยังต้องลงทะเบียน passkey ต่อ (forcePasskeySetup คงเดิม)
    const clearPasskeyRequirement = !isPasskeyEnforceable();
    const updated = await prisma.user.update({
      where: { id: currentUser.id },
      data: {
        password: hashedPassword,
        mustChangePassword: false,
        initialPasswordExpiresAt: null,
        ...(clearPasskeyRequirement ? { forcePasskeySetup: false } : {}),
      },
      select: { forcePasskeySetup: true },
    });

    // ตัด session อื่นทั้งหมดของผู้ใช้นี้ (เว้น session ปัจจุบัน): ถ้ารหัสเดิมรั่ว/session ถูกขโมย การเปลี่ยนรหัสต้องทำให้หมดฤทธิ์
    const currentToken = (await cookies()).get('session_token')?.value;
    await prisma.session.updateMany({
      where: {
        userId: currentUser.id,
        isValid: true,
        ...(currentToken ? { token: { not: hashSessionToken(currentToken) } } : {}),
      },
      data: { isValid: false },
    });

    logger.info('Password changed by user', { userId: currentUser.id });

    return NextResponse.json({
      success: true,
      data: { needsPasskey: updated.forcePasskeySetup },
      message: 'เปลี่ยนรหัสผ่านสำเร็จ',
    });

  } catch (error) {
    logger.error('Change password error', { error });
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
