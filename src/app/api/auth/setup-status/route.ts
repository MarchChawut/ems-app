/**
 * ==================================================
 * API Route: GET /api/auth/setup-status
 * ==================================================
 * สถานะการตั้งค่าความปลอดภัยครั้งแรกของผู้ใช้ปัจจุบัน (ใช้กับหน้า /security-setup)
 * ใช้ได้ระหว่างที่ยังตั้งค่าไม่เสร็จ (อยู่ใน SETUP_ALLOWED_API_PREFIXES)
 *
 * Response: { success: true, data: { mustChangePassword, forcePasskeySetup, passkeyAvailable, passkeyCount, twoFactorEnabled } }
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { isPasskeyEnforceable } from '@/lib/security-setup';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, error: authResult.error, message: authResult.message },
        { status: authResult.status }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: authResult.user!.id },
      select: {
        mustChangePassword: true,
        forcePasskeySetup: true,
        twoFactorEnabled: true,
        _count: { select: { authenticators: true } },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        mustChangePassword: user?.mustChangePassword ?? false,
        forcePasskeySetup: user?.forcePasskeySetup ?? false,
        // ระบบนี้ลงทะเบียน passkey ได้จริงหรือไม่ (ต้องเป็นโดเมน + HTTPS) — ถ้าไม่ได้ UI จะไม่บังคับขั้นนี้
        passkeyAvailable: isPasskeyEnforceable(),
        passkeyCount: user?._count.authenticators ?? 0,
        twoFactorEnabled: user?.twoFactorEnabled ?? false,
      },
    });
  } catch (error) {
    logger.error('Setup status error', { error });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      { status: 500 }
    );
  }
}
