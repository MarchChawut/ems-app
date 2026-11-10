/**
 * ==================================================
 * Database Rate Limiting - ระบบ Rate Limiting ด้วย Database
 * ==================================================
 * ใช้ฐานข้อมูลแทน in-memory Map เพื่อรองรับ multi-instance
 * 
 * การใช้งาน:
 * import { dbRateLimit } from '@/lib/rate-limit-db';
 * const isLimited = await dbRateLimit.isRateLimited(identifier);
 */

import { prisma } from './prisma';
import { logger } from './logger';

// การตั้งค่า
const MAX_LOGIN_ATTEMPTS = 5;
// เพดานสำหรับตัวนับระดับ username สูงกว่าระดับ IP โดยตั้งใจ — username ของระบบนี้เดา
// ได้ไม่ยาก (เช่น รหัสพนักงาน) การใช้เพดานเดียวกับ IP (5) จะทำให้ใครก็ตามที่รู้ username
// คนอื่น ยิง request ผิดแค่ 5 ครั้งก็ล็อกบัญชีเจ้าของจริงได้ (DoS ต่อบัญชีเป้าหมาย)
const MAX_USERNAME_ATTEMPTS = 15;
const LOCKOUT_DURATION = 30 * 60 * 1000; // 30 นาที

/** ฟิลด์ที่ใช้เป็น identifier ในการนับ attempts (มี index ทั้งคู่ใน LoginAttempt) */
type RateLimitField = 'ipAddress' | 'username';

/**
 * Database Rate Limiter Class
 */
class DatabaseRateLimiter {
  /**
   * ตรวจสอบว่า identifier (IP หรือ username) ถูกบล็อกหรือไม่
   *
   * IP อย่างเดียวปลอมได้ด้วย header X-Forwarded-For (ดู getClientIp ใน src/lib/auth.ts
   * ที่เชื่อ header นี้แบบไม่มีการตรวจสอบ proxy ต้นทาง) จึง caller ที่มี username
   * ในมือ (login ด้วยรหัสผ่าน, passkey) ควรเรียกทั้ง 2 field เพื่อให้ยังบล็อกได้
   * แม้ผู้โจมตีจะเปลี่ยน IP ที่อ้างทุกครั้ง — เพราะจะไปติดที่ตัวนับของ username แทน
   */
  async isRateLimited(identifier: string, field: RateLimitField = 'ipAddress'): Promise<boolean> {
    try {
      // หา login attempts ล่าสุดที่ยังไม่ expired
      const since = new Date(Date.now() - LOCKOUT_DURATION);

      const attempts = await prisma.loginAttempt.count({
        where: {
          [field]: identifier,
          success: false,
          createdAt: {
            gte: since,
          },
        },
      });

      const max = field === 'username' ? MAX_USERNAME_ATTEMPTS : MAX_LOGIN_ATTEMPTS;
      return attempts >= max;
    } catch (error) {
      logger.error('Rate limit check failed', { error, identifier, field });
      // ถ้าตรวจสอบไม่ได้ ให้ผ่านไปก่อน (fail open) เพื่อไม่ block ผู้ใช้
      return false;
    }
  }

  /**
   * บันทึกการพยายามเข้าสู่ระบบ (ใช้ loginAttempt.create โดยตรง)
   * ฟังก์ชันนี้เพิ่มความสะดวกในการดึงข้อมูล
   */
  async getLoginAttempts(identifier: string): Promise<{
    count: number;
    remainingAttempts: number;
    isLocked: boolean;
    lastAttempt: Date | null;
  }> {
    try {
      const since = new Date(Date.now() - LOCKOUT_DURATION);
      
      // ดึงการพยายามล่าสุด
      const [count, lastAttempt] = await Promise.all([
        prisma.loginAttempt.count({
          where: {
            ipAddress: identifier,
            success: false,
            createdAt: {
              gte: since,
            },
          },
        }),
        prisma.loginAttempt.findFirst({
          where: {
            ipAddress: identifier,
            success: false,
            createdAt: {
              gte: since,
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
          select: {
            createdAt: true,
          },
        }),
      ]);
      
      const isLocked = count >= MAX_LOGIN_ATTEMPTS;
      const remainingAttempts = Math.max(0, MAX_LOGIN_ATTEMPTS - count);
      
      return {
        count,
        remainingAttempts,
        isLocked,
        lastAttempt: lastAttempt?.createdAt || null,
      };
    } catch (error) {
      logger.error('Get login attempts failed', { error, identifier });
      return {
        count: 0,
        remainingAttempts: MAX_LOGIN_ATTEMPTS,
        isLocked: false,
        lastAttempt: null,
      };
    }
  }

  /**
   * ล้างข้อมูลการพยายามเข้าสู่ระบบ (เมื่อ login สำเร็จ)
   * ลบเฉพาะ records ที่เก่าเกิน LOCKOUT_DURATION
   */
  async clearAttempts(identifier: string, field: RateLimitField = 'ipAddress'): Promise<void> {
    try {
      const since = new Date(Date.now() - LOCKOUT_DURATION);

      await prisma.loginAttempt.deleteMany({
        where: {
          [field]: identifier,
          createdAt: {
            gte: since,
          },
        },
      });

      logger.info('Cleared login attempts', { identifier, field });
    } catch (error) {
      logger.error('Clear login attempts failed', { error, identifier, field });
    }
  }
}

// Export singleton
export const dbRateLimit = new DatabaseRateLimiter();

// Export settings for reference
export { MAX_LOGIN_ATTEMPTS, MAX_USERNAME_ATTEMPTS, LOCKOUT_DURATION };
