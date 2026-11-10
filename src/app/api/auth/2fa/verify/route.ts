/**
 * ==================================================
 * API Route: POST /api/auth/2fa/verify
 * ==================================================
 * ยืนยันรหัส TOTP หรือ backup code ของผู้ที่เปิด 2FA ไว้แล้ว แล้วออก session
 * (ขั้น VERIFY ระหว่าง login)
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
  findMatchingBackupCode,
  MAX_2FA_ATTEMPTS,
} from '@/lib/twofactor';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  const clientIp = getClientIp(request);

  try {
    // กัน brute force ระดับ IP (เสริมจากตัวนับต่อ challenge)
    if (await dbRateLimit.isRateLimited(clientIp)) {
      return NextResponse.json(
        { success: false, error: 'TOO_MANY_ATTEMPTS', message: 'พยายามหลายครั้งเกินไป กรุณาลองใหม่ภายหลัง' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const code: string = typeof body?.code === 'string' ? body.code : '';

    const challenge = await getPendingChallenge();
    if (!challenge) {
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
    if (!user || !user.isActive || !user.twoFactorEnabled || !user.twoFactorSecret) {
      return NextResponse.json(
        { success: false, error: 'USER_INVALID', message: 'ไม่สามารถยืนยันตัวตนได้' },
        { status: 400 }
      );
    }

    // 1) ลองตรวจเป็นรหัส TOTP ก่อน
    let verified = await verifyTotp(decrypt(user.twoFactorSecret), code);

    // 2) ถ้าไม่ผ่าน ลองตรวจเป็น backup code (ใช้ครั้งเดียว)
    if (!verified) {
      const unused = await prisma.twoFactorBackupCode.findMany({
        where: { userId: user.id, usedAt: null },
        select: { id: true, codeHash: true },
      });
      const matchedId = await findMatchingBackupCode(code, unused);
      if (matchedId) {
        await prisma.twoFactorBackupCode.update({
          where: { id: matchedId },
          data: { usedAt: new Date() },
        });
        verified = true;
      }
    }

    if (!verified) {
      await bumpChallengeAttempts(challenge.id);
      await prisma.loginAttempt.create({
        data: { userId: user.id, username: user.username, ipAddress: clientIp, success: false, reason: '2FA ไม่ถูกต้อง' },
      });
      return NextResponse.json(
        { success: false, error: 'INVALID_CODE', message: 'รหัสไม่ถูกต้อง กรุณาลองใหม่' },
        { status: 401 }
      );
    }

    // ยืนยันสำเร็จ - จบ challenge + ออก session
    await finishChallenge(challenge.id);
    const { expiresAt } = await createSession(user.id, request);
    await prisma.loginAttempt.create({
      data: { userId: user.id, username: user.username, ipAddress: clientIp, success: true },
    });
    await dbRateLimit.clearAttempts(clientIp);

    logger.info('User logged in with 2FA', { userId: user.id, ip: clientIp });

    const avatar = user.avatar || generateAvatarInitials(user.name);
    const { password: _, twoFactorSecret: __, ...safeUser } = user;

    return NextResponse.json({
      success: true,
      data: { user: { ...safeUser, avatar }, expiresAt },
      message: 'เข้าสู่ระบบสำเร็จ',
    });
  } catch (error) {
    logger.error('2FA verify error', { error, ip: clientIp });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      { status: 500 }
    );
  }
}
