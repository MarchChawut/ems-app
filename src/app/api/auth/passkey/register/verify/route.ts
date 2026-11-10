/**
 * ==================================================
 * API Route: POST /api/auth/passkey/register/verify
 * ==================================================
 * ตรวจสอบผลการลงทะเบียน passkey และบันทึก authenticator ลงฐานข้อมูล
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import {
  getRpConfig,
  consumeChallenge,
  toBase64url,
  serializeTransports,
} from '@/lib/webauthn';
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
    const user = auth.user;
    const { rpID, origin } = getRpConfig();

    const body = await request.json();
    const attResp = body?.response as RegistrationResponseJSON | undefined;
    const passkeyName: string | undefined =
      typeof body?.name === 'string' ? body.name.slice(0, 100) : undefined;

    if (!attResp) {
      return NextResponse.json(
        { success: false, error: 'VALIDATION_ERROR', message: 'ข้อมูลไม่ครบถ้วน' },
        { status: 400 }
      );
    }

    // ดึง challenge ที่เก็บไว้และตรวจสอบว่าเป็นของผู้ใช้คนนี้
    const stored = await consumeChallenge();
    if (!stored || stored.userId !== user.id) {
      return NextResponse.json(
        {
          success: false,
          error: 'CHALLENGE_INVALID',
          message: 'คำขอหมดอายุหรือไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง',
        },
        { status: 400 }
      );
    }

    const verification = await verifyRegistrationResponse({
      response: attResp,
      expectedChallenge: stored.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json(
        { success: false, error: 'VERIFICATION_FAILED', message: 'ไม่สามารถยืนยัน passkey ได้' },
        { status: 400 }
      );
    }

    const { credential, credentialDeviceType, credentialBackedUp } =
      verification.registrationInfo;

    // กันการลงทะเบียนซ้ำ credential เดิม
    const duplicate = await prisma.authenticator.findUnique({
      where: { credentialId: credential.id },
    });
    if (duplicate) {
      return NextResponse.json(
        {
          success: false,
          error: 'ALREADY_REGISTERED',
          message: 'อุปกรณ์นี้ถูกลงทะเบียนไว้แล้ว',
        },
        { status: 409 }
      );
    }

    await prisma.authenticator.create({
      data: {
        userId: user.id,
        credentialId: credential.id,
        publicKey: toBase64url(credential.publicKey),
        counter: credential.counter,
        transports: serializeTransports(credential.transports),
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        name: passkeyName || null,
      },
    });

    // ลงทะเบียน passkey สำเร็จ = ครบเงื่อนไขขั้น passkey ของการตั้งค่าครั้งแรก
    await prisma.user.updateMany({ where: { id: user.id, forcePasskeySetup: true }, data: { forcePasskeySetup: false } });

    logger.info('Passkey registered', { userId: user.id });

    return NextResponse.json({
      success: true,
      message: 'ลงทะเบียน passkey สำเร็จ',
    });
  } catch (error) {
    logger.error('Passkey register verify error', { error });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      { status: 500 }
    );
  }
}
