/**
 * ==================================================
 * API Route: POST /api/auth/2fa/backup-codes/regenerate
 * ==================================================
 * สร้างชุด backup code ใหม่ (ยกเลิกชุดเดิม) ต้องยืนยันด้วยรหัส TOTP ปัจจุบันก่อน
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { decrypt } from '@/lib/crypto';
import { verifyTotp, generateBackupCodes } from '@/lib/twofactor';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.success || !auth.user) {
      return NextResponse.json(
        { success: false, error: auth.error, message: auth.message },
        { status: auth.status ?? 401 }
      );
    }

    const body = await request.json();
    const code: string = typeof body?.code === 'string' ? body.code : '';

    const user = await prisma.user.findUnique({ where: { id: auth.user.id } });
    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      return NextResponse.json(
        { success: false, error: 'NOT_ENABLED', message: 'ยังไม่ได้เปิดใช้งาน 2FA' },
        { status: 400 }
      );
    }

    // ต้องยืนยันด้วยรหัส TOTP ปัจจุบันก่อนสร้างชุดใหม่
    const valid = await verifyTotp(decrypt(user.twoFactorSecret), code);
    if (!valid) {
      return NextResponse.json(
        { success: false, error: 'INVALID_CODE', message: 'รหัสไม่ถูกต้อง' },
        { status: 400 }
      );
    }

    const { plain, hashes } = await generateBackupCodes();
    await prisma.$transaction([
      prisma.twoFactorBackupCode.deleteMany({ where: { userId: user.id } }),
      prisma.twoFactorBackupCode.createMany({
        data: hashes.map((codeHash) => ({ userId: user.id, codeHash })),
      }),
    ]);

    logger.info('2FA backup codes regenerated', { userId: user.id });

    return NextResponse.json({
      success: true,
      data: { backupCodes: plain },
      message: 'สร้างรหัสสำรองใหม่สำเร็จ',
    });
  } catch (error) {
    logger.error('2FA backup regenerate error', { error });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      { status: 500 }
    );
  }
}
