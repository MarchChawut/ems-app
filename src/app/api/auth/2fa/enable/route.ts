/**
 * ==================================================
 * API Route: POST /api/auth/2fa/enable
 * ==================================================
 * ยืนยันรหัสจากแอป authenticator เพื่อเปิดใช้งาน 2FA + สร้าง backup codes + ออก session
 * (ขั้นจบของการ ENROLL ระหว่าง login)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/crypto';
import { createSession, getClientIp } from '@/lib/auth';
import { generateAvatarInitials } from '@/lib/security';
import { dbRateLimit } from '@/lib/rate-limit-db';
import {
  getPendingChallenge,
  finishChallenge,
  bumpChallengeAttempts,
  verifyTotp,
  generateBackupCodes,
  MAX_2FA_ATTEMPTS,
} from '@/lib/twofactor';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  const clientIp = getClientIp(request);

  try {
    // กัน brute force ระดับ IP (เสริมจากตัวนับต่อ challenge) เหมือน 2fa/verify
    if (await dbRateLimit.isRateLimited(clientIp)) {
      return NextResponse.json(
        { success: false, error: 'TOO_MANY_ATTEMPTS', message: 'พยายามหลายครั้งเกินไป กรุณาลองใหม่ภายหลัง' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const code: string = typeof body?.code === 'string' ? body.code : '';

    const challenge = await getPendingChallenge();
    if (!challenge || !challenge.pendingSecret) {
      return NextResponse.json(
        { success: false, error: 'CHALLENGE_INVALID', message: 'คำขอหมดอายุ กรุณาเข้าสู่ระบบใหม่' },
        { status: 400 }
      );
    }

    if (challenge.attempts >= MAX_2FA_ATTEMPTS) {
      await finishChallenge(challenge.id);
      return NextResponse.json(
        { success: false, error: 'TOO_MANY_ATTEMPTS', message: 'กรอกรหัสผิดหลายครั้ง กรุณาเข้าสู่ระบบใหม่' },
        { status: 429 }
      );
    }

    const user = await prisma.user.findUnique({ where: { id: challenge.userId } });
    if (!user || !user.isActive || user.twoFactorEnabled) {
      return NextResponse.json(
        { success: false, error: 'USER_INVALID', message: 'ไม่สามารถเปิดใช้งาน 2FA ได้' },
        { status: 400 }
      );
    }

    const secret = decrypt(challenge.pendingSecret);
    const valid = await verifyTotp(secret, code);
    if (!valid) {
      await bumpChallengeAttempts(challenge.id);
      return NextResponse.json(
        { success: false, error: 'INVALID_CODE', message: 'รหัสไม่ถูกต้อง กรุณาลองใหม่' },
        { status: 400 }
      );
    }

    // เปิดใช้งาน 2FA + เก็บ secret (เข้ารหัสแล้ว) + สร้าง backup codes
    const { plain, hashes } = await generateBackupCodes();
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { twoFactorEnabled: true, twoFactorSecret: challenge.pendingSecret },
      }),
      prisma.twoFactorBackupCode.deleteMany({ where: { userId: user.id } }),
      prisma.twoFactorBackupCode.createMany({
        data: hashes.map((codeHash) => ({ userId: user.id, codeHash })),
      }),
    ]);

    await finishChallenge(challenge.id);

    // ออก session ให้เข้าสู่ระบบสำเร็จ
    const { expiresAt } = await createSession(user.id, request);
    await prisma.loginAttempt.create({
      data: { userId: user.id, username: user.username, ipAddress: clientIp, success: true },
    });

    logger.info('2FA enrolled and enabled', { userId: user.id, ip: clientIp });

    const avatar = user.avatar || generateAvatarInitials(user.name);
    const { password: _, twoFactorSecret: __, ...safeUser } = user;

    return NextResponse.json({
      success: true,
      data: {
        user: { ...safeUser, twoFactorEnabled: true, avatar },
        backupCodes: plain,
        expiresAt,
      },
      message: 'เปิดใช้งาน 2FA สำเร็จ',
    });
  } catch (error) {
    logger.error('2FA enable error', { error, ip: clientIp });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      { status: 500 }
    );
  }
}
