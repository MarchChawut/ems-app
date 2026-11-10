/**
 * ==================================================
 * API Route: POST /api/auth/passkey/login/verify
 * ==================================================
 * ตรวจสอบการเข้าสู่ระบบด้วย passkey แล้วสร้าง session เหมือนการ login ด้วยรหัสผ่าน
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
} from '@simplewebauthn/server';
import { prisma } from '@/lib/prisma';
import { generateAvatarInitials } from '@/lib/security';
import { createSession, getClientIp } from '@/lib/auth';
import {
  getRpConfig,
  consumeChallenge,
  fromBase64url,
  parseTransports,
} from '@/lib/webauthn';
import { dbRateLimit } from '@/lib/rate-limit-db';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  const clientIp = getClientIp(request);

  try {
    const isLimited = await dbRateLimit.isRateLimited(clientIp);
    if (isLimited) {
      logger.warn('Blocked passkey login verify attempt due to rate limit', { ip: clientIp });
      return NextResponse.json(
        {
          success: false,
          error: 'TOO_MANY_ATTEMPTS',
          message: 'คุณพยายามเข้าสู่ระบบผิดพลาดหลายครั้ง กรุณาลองใหม่ในอีก 30 นาที',
        },
        { status: 429 }
      );
    }

    const { rpID, origin } = getRpConfig();

    const body = await request.json();
    const authResp = body?.response as AuthenticationResponseJSON | undefined;
    if (!authResp) {
      return NextResponse.json(
        { success: false, error: 'VALIDATION_ERROR', message: 'ข้อมูลไม่ครบถ้วน' },
        { status: 400 }
      );
    }

    // ดึง challenge ที่เก็บไว้จากขั้น options
    const stored = await consumeChallenge();
    if (!stored || !stored.userId) {
      return NextResponse.json(
        {
          success: false,
          error: 'CHALLENGE_INVALID',
          message: 'คำขอหมดอายุหรือไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง',
        },
        { status: 400 }
      );
    }

    // ค้นหา authenticator จาก credential ID ที่ส่งมา และต้องเป็นของผู้ใช้เดียวกับ challenge
    const authenticator = await prisma.authenticator.findUnique({
      where: { credentialId: authResp.id },
      include: { user: true },
    });

    if (!authenticator || authenticator.userId !== stored.userId) {
      return NextResponse.json(
        { success: false, error: 'PASSKEY_NOT_FOUND', message: 'ไม่พบ passkey นี้' },
        { status: 404 }
      );
    }

    if (!authenticator.user.isActive) {
      return NextResponse.json(
        { success: false, error: 'ACCOUNT_DISABLED', message: 'บัญชีของคุณถูกปิดใช้งาน' },
        { status: 403 }
      );
    }

    // เช็คซ้ำระดับ username ก่อนตรวจลายเซ็น WebAuthn (ราคาแพงกว่า) — ตอนนี้รู้ username แล้ว
    // ป้องกัน IP ที่ปลอมผ่าน X-Forwarded-For ทำให้ตัวนับระดับ IP รีเซ็ตได้ทุกครั้ง
    if (await dbRateLimit.isRateLimited(authenticator.user.username, 'username')) {
      logger.warn('Blocked passkey login verify attempt due to username rate limit', {
        username: authenticator.user.username,
        ip: clientIp,
      });
      return NextResponse.json(
        {
          success: false,
          error: 'TOO_MANY_ATTEMPTS',
          message: 'คุณพยายามเข้าสู่ระบบผิดพลาดหลายครั้ง กรุณาลองใหม่ในอีก 30 นาที',
        },
        { status: 429 }
      );
    }

    const verification = await verifyAuthenticationResponse({
      response: authResp,
      expectedChallenge: stored.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      // ต้องยืนยันตัวตนบนอุปกรณ์ (PIN/biometric) เสมอ เพราะ passkey login ไม่ผ่าน
      // ขั้น 2FA แยกต่างหาก (ต่างจาก password login) — การพิสูจน์แค่ "มี credential"
      // อย่างเดียวจึงไม่พอ ต้องพิสูจน์ "ปลดล็อกอุปกรณ์ได้" ด้วย
      requireUserVerification: true,
      credential: {
        id: authenticator.credentialId,
        publicKey: fromBase64url(authenticator.publicKey),
        counter: authenticator.counter,
        transports: parseTransports(authenticator.transports) as AuthenticatorTransportFuture[] | undefined,
      },
    });

    if (!verification.verified) {
      await prisma.loginAttempt.create({
        data: {
          userId: authenticator.userId,
          username: authenticator.user.username,
          ipAddress: clientIp,
          success: false,
          reason: 'passkey ยืนยันไม่สำเร็จ',
        },
      });
      return NextResponse.json(
        { success: false, error: 'VERIFICATION_FAILED', message: 'ไม่สามารถยืนยัน passkey ได้' },
        { status: 401 }
      );
    }

    // อัปเดต counter (ป้องกัน replay) และเวลาใช้งานล่าสุด
    await prisma.authenticator.update({
      where: { id: authenticator.id },
      data: {
        counter: verification.authenticationInfo.newCounter,
        lastUsedAt: new Date(),
      },
    });

    const user = authenticator.user;
    await dbRateLimit.clearAttempts(clientIp);
    await dbRateLimit.clearAttempts(user.username, 'username');
    logger.info('User logged in with passkey', { userId: user.id, ip: clientIp });

    // --- สร้าง session ผ่าน helper กลาง (ใช้ร่วมกับ password/2FA login) ---
    // token อยู่ใน cookie httpOnly เท่านั้น — ห้ามส่งกลับใน JSON body (JS/XSS จะอ่านได้และ httpOnly ไร้ความหมาย)
    const { expiresAt } = await createSession(user.id, request);

    await prisma.loginAttempt.create({
      data: {
        userId: user.id,
        username: user.username,
        ipAddress: clientIp,
        success: true,
      },
    });

    const avatar = user.avatar || generateAvatarInitials(user.name);

    // ส่งกลับเฉพาะฟิลด์สาธารณะ (ไม่ spread ทั้งแถว: จะหลุด twoFactorSecret และข้อมูลส่วนตัว)
    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          prefix: user.prefix,
          name: user.name,
          role: user.role,
          avatar,
        },
        expiresAt,
      },
      message: 'เข้าสู่ระบบสำเร็จ',
    });
  } catch (error) {
    logger.error('Passkey login verify error', { error, ip: clientIp });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      { status: 500 }
    );
  }
}
