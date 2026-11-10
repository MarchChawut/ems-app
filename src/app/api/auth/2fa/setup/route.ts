/**
 * ==================================================
 * API Route: POST /api/auth/2fa/setup
 * ==================================================
 * เริ่มลงทะเบียน 2FA (สร้าง secret + QR) ระหว่าง login
 * เข้าถึงได้เฉพาะผู้ที่ผ่านการตรวจรหัสผ่านแล้ว (มี cookie 2fa_pending) และยังไม่ได้เปิด 2FA
 */

import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { prisma } from '@/lib/prisma';
import { encrypt } from '@/lib/crypto';
import {
  getPendingChallenge,
  generateTotpSecret,
  buildOtpAuthUri,
} from '@/lib/twofactor';
import { logger } from '@/lib/logger';

export async function POST() {
  try {
    const challenge = await getPendingChallenge();
    if (!challenge) {
      return NextResponse.json(
        { success: false, error: 'CHALLENGE_INVALID', message: 'คำขอหมดอายุ กรุณาเข้าสู่ระบบใหม่' },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({ where: { id: challenge.userId } });
    if (!user || !user.isActive) {
      return NextResponse.json(
        { success: false, error: 'USER_INVALID', message: 'ไม่พบผู้ใช้หรือบัญชีถูกปิดใช้งาน' },
        { status: 400 }
      );
    }

    // ป้องกันการตั้ง 2FA ใหม่ทับของเดิม (ผู้ที่เปิด 2FA แล้วต้องไปทางขั้นยืนยัน)
    if (user.twoFactorEnabled) {
      return NextResponse.json(
        { success: false, error: 'ALREADY_ENABLED', message: 'บัญชีนี้เปิดใช้งาน 2FA แล้ว' },
        { status: 409 }
      );
    }

    // สร้าง secret ใหม่ เก็บแบบเข้ารหัสไว้บน challenge รอยืนยันในขั้น enable
    const secret = generateTotpSecret();
    await prisma.twoFactorChallenge.update({
      where: { id: challenge.id },
      data: { pendingSecret: encrypt(secret) },
    });

    const otpauthUri = buildOtpAuthUri(user.username, secret);
    const qrDataUrl = await QRCode.toDataURL(otpauthUri);

    // ส่ง secret กลับเพื่อให้กรอกเองได้ (กรณีสแกน QR ไม่ได้)
    return NextResponse.json({ success: true, data: { qrDataUrl, secret } });
  } catch (error) {
    logger.error('2FA setup error', { error });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      { status: 500 }
    );
  }
}
