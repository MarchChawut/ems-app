/**
 * ==================================================
 * API Route: POST /api/auth/passkey/register/options
 * ==================================================
 * สร้าง options สำหรับลงทะเบียน passkey ใหม่ (ต้องเข้าสู่ระบบก่อน)
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import type { AuthenticatorTransportFuture } from '@simplewebauthn/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { getRpConfig, storeChallenge, parseTransports } from '@/lib/webauthn';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    // ต้องเข้าสู่ระบบก่อนจึงจะลงทะเบียน passkey ได้
    const auth = await requireAuth(request);
    if (!auth.success || !auth.user) {
      return NextResponse.json(
        { success: false, error: auth.error, message: auth.message },
        { status: auth.status ?? 401 }
      );
    }
    const user = auth.user;
    const { rpID, rpName } = getRpConfig();

    // ดึง passkey ที่ลงทะเบียนไว้แล้วเพื่อกันการลงทะเบียนซ้ำอุปกรณ์เดิม
    const existing = await prisma.authenticator.findMany({
      where: { userId: user.id },
    });

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userName: user.username,
      userDisplayName: user.name,
      attestationType: 'none',
      excludeCredentials: existing.map((a) => ({
        id: a.credentialId,
        transports: parseTransports(a.transports) as AuthenticatorTransportFuture[] | undefined,
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        // 'required' (ไม่ใช่แค่ preferred) เพราะ login ไม่ผ่าน 2FA แยกต่างหาก
        // (ดู login/verify/route.ts) จึง passkey ต้องพิสูจน์ทั้ง "มีอุปกรณ์" และ
        // "ปลดล็อกอุปกรณ์ได้" (PIN/biometric) ด้วยตัวเองเสมอ
        userVerification: 'required',
      },
    });

    // เก็บ challenge ไว้ตรวจสอบในขั้น verify
    await storeChallenge(options.challenge, user.id);

    return NextResponse.json({ success: true, data: options });
  } catch (error) {
    logger.error('Passkey register options error', { error });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      { status: 500 }
    );
  }
}
