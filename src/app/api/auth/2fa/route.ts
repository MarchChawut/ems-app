/**
 * ==================================================
 * API Route: GET /api/auth/2fa
 * ==================================================
 * สถานะ 2FA ของผู้ใช้ปัจจุบัน (เปิดใช้งานหรือยัง + จำนวน backup code ที่เหลือ)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.success || !auth.user) {
      return NextResponse.json(
        { success: false, error: auth.error, message: auth.message },
        { status: auth.status ?? 401 }
      );
    }

    const [user, backupCodesRemaining] = await Promise.all([
      prisma.user.findUnique({
        where: { id: auth.user.id },
        select: { twoFactorEnabled: true },
      }),
      prisma.twoFactorBackupCode.count({
        where: { userId: auth.user.id, usedAt: null },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: { enabled: user?.twoFactorEnabled ?? false, backupCodesRemaining },
    });
  } catch (error) {
    logger.error('2FA status error', { error });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      { status: 500 }
    );
  }
}
