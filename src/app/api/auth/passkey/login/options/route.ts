/**
 * ==================================================
 * API Route: POST /api/auth/passkey/login/options
 * ==================================================
 * สร้าง options สำหรับเข้าสู่ระบบด้วย passkey จาก username (ไม่ต้องเข้าสู่ระบบก่อน)
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import type { AuthenticatorTransportFuture } from '@simplewebauthn/server';
import { prisma } from '@/lib/prisma';
import { passkeyLoginSchema } from '@/lib/security';
import { getRpConfig, storeChallenge, parseTransports } from '@/lib/webauthn';
import { getClientIp } from '@/lib/auth';
import { dbRateLimit } from '@/lib/rate-limit-db';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  const clientIp = getClientIp(request);

  try {
    // เช็คระดับ IP ก่อน (ยังไม่รู้ username จนกว่าจะ parse body)
    const isLimited = await dbRateLimit.isRateLimited(clientIp);
    if (isLimited) {
      logger.warn('Blocked passkey login options request due to rate limit', { ip: clientIp });
      return NextResponse.json(
        {
          success: false,
          error: 'TOO_MANY_ATTEMPTS',
          message: 'คุณพยายามเข้าสู่ระบบผิดพลาดหลายครั้ง กรุณาลองใหม่ในอีก 30 นาที',
        },
        { status: 429 }
      );
    }

    const body = await request.json();
    const validation = passkeyLoginSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'ข้อมูลไม่ถูกต้อง',
          details: validation.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { username } = validation.data;

    // เช็คซ้ำระดับ username — ป้องกัน IP ที่ปลอมผ่าน X-Forwarded-For (ดู getClientIp)
    // ทำให้ตัวนับระดับ IP รีเซ็ตได้ทุกครั้ง แต่ยังบล็อกได้เพราะติดตัวนับของ username แทน
    if (await dbRateLimit.isRateLimited(username, 'username')) {
      logger.warn('Blocked passkey login options request due to username rate limit', { username, ip: clientIp });
      return NextResponse.json(
        {
          success: false,
          error: 'TOO_MANY_ATTEMPTS',
          message: 'คุณพยายามเข้าสู่ระบบผิดพลาดหลายครั้ง กรุณาลองใหม่ในอีก 30 นาที',
        },
        { status: 429 }
      );
    }

    const { rpID } = getRpConfig();

    const user = await prisma.user.findUnique({
      where: { username },
      include: { authenticators: true },
    });

    // ไม่พบผู้ใช้ / ถูกปิดใช้งาน / ยังไม่ได้ลงทะเบียน passkey
    if (!user || !user.isActive || user.authenticators.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'NO_PASSKEY',
          message: 'ไม่พบ passkey สำหรับผู้ใช้นี้ กรุณาเข้าสู่ระบบด้วยรหัสผ่าน',
        },
        { status: 404 }
      );
    }

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: user.authenticators.map((a) => ({
        id: a.credentialId,
        transports: parseTransports(a.transports) as AuthenticatorTransportFuture[] | undefined,
      })),
      // ต้องตรงกับ requireUserVerification: true ใน login/verify/route.ts — สั่งให้เบราว์เซอร์
      // ขอ PIN/biometric เสมอ ไม่ใช่แค่ "ถ้าทำได้" (ป้องกัน mismatch ที่ทำให้ verify ล้มเหลว)
      userVerification: 'required',
    });

    await storeChallenge(options.challenge, user.id);

    return NextResponse.json({ success: true, data: options });
  } catch (error) {
    logger.error('Passkey login options error', { error });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      { status: 500 }
    );
  }
}
