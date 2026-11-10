/**
 * ==================================================
 * API Route: POST /api/auth/login
 * ==================================================
 * API สำหรับเข้าสู่ระบบด้วย username และ password
 * มีการป้องกัน Brute Force Attack และการบันทึก log
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPassword, loginSchema, getDummyPasswordHash } from '@/lib/security';
import { isInitialPasswordExpired } from '@/lib/security-setup';
import { dbRateLimit } from '@/lib/rate-limit-db';
import { createPendingChallenge } from '@/lib/twofactor';
import { logger } from '@/lib/logger';

/**
 * ฟังก์ชันสำหรับดึง IP address จาก request
 * @param request - NextRequest object
 * @returns {string} IP address
 */
function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  
  if (realIp) {
    return realIp;
  }
  
  return 'unknown';
}

/**
 * POST /api/auth/login
 * เข้าสู่ระบบด้วย username และ password
 * 
 * Request Body:
 * {
 *   username: string;
 *   password: string;
 * }
 * 
 * Response:
 * {
 *   success: true,
 *   data: {
 *     user: { id, email, username, name, role, avatar },
 *     token: string,
 *     expiresAt: Date
 *   }
 * }
 */
export async function POST(request: NextRequest) {
  // ดึง IP address ของ client (declare outside try for error logging)
  const clientIp = getClientIp(request);

  try {
    // ตรวจสอบ Rate Limiting (ป้องกัน Brute Force) แบบ Database ระดับ IP ก่อน
    // (ยังไม่รู้ username จนกว่าจะ parse body — เช็คซ้ำอีกครั้งด้วย username ด้านล่าง
    // เพื่อกัน IP spoofing ผ่าน X-Forwarded-For ที่ทำให้ตัวนับระดับ IP รีเซ็ตได้ทุกครั้ง)
    const isLimited = await dbRateLimit.isRateLimited(clientIp);
    if (isLimited) {
      logger.warn('Blocked login attempt due to rate limit', { ip: clientIp });
      await prisma.loginAttempt.create({
        data: {
          username: 'unknown',
          ipAddress: clientIp,
          success: false,
          reason: 'IP ถูกบล็อกเนื่องจากพยายามเข้าสู่ระบบผิดพลาดหลายครั้ง',
        },
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

    // อ่านข้อมูลจาก request body
    const body = await request.json();

    // ตรวจสอบข้อมูลด้วย Zod Schema
    const validationResult = loginSchema.safeParse(body);

    if (!validationResult.success) {
      const errors = validationResult.error.flatten().fieldErrors;

      return NextResponse.json(
        {
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'ข้อมูลไม่ถูกต้อง',
          details: errors,
        },
        { status: 400 }
      );
    }

    const { username, password } = validationResult.data;

    // เช็คซ้ำระดับ username — บล็อกได้แม้ผู้โจมตีจะสลับ IP/ปลอม X-Forwarded-For ทุกครั้ง
    // *ห้าม* บันทึก loginAttempt แถวใหม่ที่นี่ (ต่างจาก branch ระดับ IP ด้านบน) เพราะจะกลาย
    // เป็นการต่ออายุ window ของตัวเองไปเรื่อยๆ ทุกครั้งที่ถูกบล็อก - เจ้าของบัญชีตัวจริงที่พยายาม
    // เข้าระบบซ้ำหลังโดนบล็อกจะยิ่งเลื่อนเวลาปลดล็อกออกไปไม่รู้จบ กลายเป็น DoS ถาวรต่อบัญชีตัวเอง
    // ตัวนับนี้ควรโตจากความพยายามเข้าระบบจริง (user not found / wrong password ด้านล่าง) เท่านั้น
    if (await dbRateLimit.isRateLimited(username, 'username')) {
      logger.warn('Blocked login attempt due to username rate limit', { username, ip: clientIp });
      return NextResponse.json(
        {
          success: false,
          error: 'TOO_MANY_ATTEMPTS',
          message: 'คุณพยายามเข้าสู่ระบบผิดพลาดหลายครั้ง กรุณาลองใหม่ในอีก 30 นาที',
        },
        { status: 429 }
      );
    }

    // ค้นหาผู้ใช้จากฐานข้อมูล
    const user = await prisma.user.findUnique({
      where: { username },
    });

    // ตรวจรหัสผ่านเสมอ แม้ไม่พบผู้ใช้ (เทียบกับ hash หลอก) เพื่อให้ใช้เวลาใกล้เคียงกัน — กันเดา username ผ่านเวลาตอบสนอง
    const isPasswordValid = await verifyPassword(password, user?.password ?? (await getDummyPasswordHash()));

    // ข้อความเดียวกันทุกกรณีที่ล้มเหลว (ไม่พบผู้ใช้/รหัสผ่านผิด/บัญชีถูกปิด) ไม่เปิดเผยว่า username ไหนมีอยู่หรือถูกปิดใช้งาน
    // (เดิมตอบ ACCOUNT_DISABLED "ก่อน" ตรวจรหัสผ่าน ทำให้ใครก็ถามได้ว่าบัญชีไหนถูกปิด) — เหตุผลจริงเก็บใน loginAttempt เท่านั้น
    const invalidCredentials = () =>
      NextResponse.json(
        {
          success: false,
          error: 'INVALID_CREDENTIALS',
          message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',
        },
        { status: 401 }
      );

    if (!user || !isPasswordValid || !user.isActive) {
      await prisma.loginAttempt.create({
        data: {
          userId: user?.id,
          username,
          ipAddress: clientIp,
          success: false,
          reason: !user ? 'ไม่พบผู้ใช้' : !isPasswordValid ? 'รหัสผ่านไม่ถูกต้อง' : 'บัญชีถูกปิดใช้งาน',
        },
      });
      return invalidCredentials();
    }

    // รหัสผ่านเริ่มต้นที่แอดมินตั้งให้หมดอายุแล้ว (ไม่ได้เปลี่ยนภายในกำหนด) — ต้องให้แอดมินรีเซ็ตใหม่
    // ตอบเฉพาะหลังยืนยันรหัสผ่านถูกต้องแล้วเท่านั้น จึงไม่เปิดเผยสถานะบัญชีแก่คนที่ไม่รู้รหัส
    if (isInitialPasswordExpired(user)) {
      await prisma.loginAttempt.create({
        data: { userId: user.id, username, ipAddress: clientIp, success: false, reason: 'รหัสผ่านเริ่มต้นหมดอายุ' },
      });
      return NextResponse.json(
        {
          success: false,
          error: 'INITIAL_PASSWORD_EXPIRED',
          message: 'รหัสผ่านเริ่มต้นหมดอายุแล้ว กรุณาติดต่อผู้ดูแลระบบเพื่อรีเซ็ตรหัสผ่าน',
        },
        { status: 403 }
      );
    }

    // รหัสผ่านถูกต้อง - ล้างข้อมูลการพยายามที่ล้มเหลว
    await dbRateLimit.clearAttempts(clientIp);
    await dbRateLimit.clearAttempts(username, 'username');

    logger.info('Password verified, 2FA required', { userId: user.id, username, ip: clientIp });

    // ยังไม่ออก session ทันที - บังคับยืนยันปัจจัยที่สอง (2FA) ก่อนเสมอ
    // สร้าง challenge ชั่วคราว + ตั้ง cookie 2fa_pending
    await createPendingChallenge(user.id);

    // ผู้ใช้ที่ยังไม่ได้ตั้ง 2FA ต้องลงทะเบียนก่อน (ENROLL) ที่เหลือเข้าสู่ขั้นยืนยัน (VERIFY)
    return NextResponse.json({
      success: true,
      data: {
        requires2FA: true,
        mode: user.twoFactorEnabled ? 'VERIFY' : 'ENROLL',
        username: user.username,
      },
      message: 'กรุณายืนยันตัวตนด้วยรหัส 2FA',
    });

  } catch (error) {
    logger.error('Login error', { error, ip: clientIp });
    
    return NextResponse.json(
      {
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่อีกครั้ง',
      },
      { status: 500 }
    );
  }
}
