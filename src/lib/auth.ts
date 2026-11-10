/**
 * ==================================================
 * Authentication Helpers - ฟังก์ชันช่วยเหลือการตรวจสอบสิทธิ์
 * ==================================================
 * ไฟล์นี้รวมฟังก์ชันสำหรับตรวจสอบ session และสิทธิ์การใช้งาน
 */

import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { prisma } from './prisma';
import { generateSecureToken, hashSessionToken } from './security';
import { SessionUser, UserRole } from '@/types';
import { logger } from '@/lib/logger';
import { hasPermission, type PermissionKey } from './permissions';
import { isSetupAllowedPath } from './security-setup';
import { featureForApiPath } from './features';
import { isFeatureEnabled } from './feature-settings-server';

/** ระยะเวลาหมดอายุของ session (ชั่วโมง) */
const SESSION_EXPIRY_HOURS = 24;

/**
 * ดึง IP address ของ client จาก request (ใช้ร่วมกันในทุก route ที่ออก session และใน rate limit)
 *
 * X-Forwarded-For ถูก "ต่อท้าย" โดยแต่ละ proxy ที่ผ่าน — ค่าที่อยู่ซ้าย (ตัวแรก) client ปลอมเองได้ทั้งหมด
 * เดิมเอาตัวแรกมาใช้ → ผู้โจมตีใส่ XFF ใหม่ทุกครั้งแล้วตัวนับ rate limit ระดับ IP รีเซ็ตทุกครั้ง
 * จึงนับจากด้านขวาตามจำนวน proxy ที่เชื่อถือ (TRUSTED_PROXY_HOPS, ค่าเริ่มต้น 1 = reverse proxy ตัวเดียวหน้าแอป)
 * ค่าที่เหลือทางซ้ายถูกมองว่าไม่น่าเชื่อถือและไม่ถูกใช้
 */
export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const hops = Math.max(1, parseInt(process.env.TRUSTED_PROXY_HOPS || '1', 10) || 1);
  if (forwarded) {
    const parts = forwarded
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length > 0) {
      return parts[Math.max(0, parts.length - hops)];
    }
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  return 'unknown';
}

/**
 * สร้าง session ใหม่และตั้ง cookie `session_token`
 * ใช้ร่วมกันโดย login (password), 2FA verify/enable และ passkey login
 * เพื่อให้พฤติกรรมการออก session เหมือนกันทุกทาง
 * @returns {token, expiresAt}
 */
export async function createSession(
  userId: number,
  request: NextRequest
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSecureToken(64);
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + SESSION_EXPIRY_HOURS);

  await prisma.session.create({
    data: {
      userId,
      // DB เก็บเฉพาะ hash ของ token (cookie เก็บค่าดิบ) — ดู hashSessionToken
      token: hashSessionToken(token),
      expiresAt,
      ipAddress: getClientIp(request),
      userAgent: request.headers.get('user-agent') || undefined,
    },
  });

  (await cookies()).set('session_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    expires: expiresAt,
    path: '/',
  });

  return { token, expiresAt };
}

/**
 * สร้าง SessionUser จากแถว User แบบ "ระบุฟิลด์ที่อนุญาตเท่านั้น" (allow-list)
 * ห้าม spread ทั้งแถว (`...user`): ผู้ใช้ที่ได้จาก getCurrentUser() ถูกส่งต่อให้ client component
 * (UserProvider/DashboardShell) แล้วถูก serialize ลง HTML ของทุกหน้า — ถ้าหลุดฟิลด์อย่าง twoFactorSecret
 * (TOTP secret ที่เข้ารหัสแล้ว), เบอร์โทร, ที่อยู่ หรือวันเกิด ก็จะไปอยู่ในเบราว์เซอร์ของทุกคน
 */
export function toSessionUser(
  user: {
    id: number;
    email: string | null;
    username: string;
    name: string;
    role: UserRole;
    avatar: string | null;
    mustChangePassword: boolean;
    forcePasskeySetup: boolean;
  },
  permissions: string[]
): SessionUser {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    name: user.name,
    role: user.role,
    avatar: user.avatar,
    permissions,
    mustChangePassword: user.mustChangePassword,
    forcePasskeySetup: user.forcePasskeySetup,
  };
}

/**
 * ผลลัพธ์การตรวจสอบการเข้าสู่ระบบ
 */
interface AuthResult {
  success: boolean;
  user?: SessionUser;
  error?: string;
  message?: string;
  status?: number;
}

/**
 * ฟังก์ชันสำหรับตรวจสอบการเข้าสู่ระบบจาก request
 * @param request - NextRequest object
 * @returns {Promise<AuthResult>} ผลลัพธ์การตรวจสอบ
 * 
 * ตัวอย่างการใช้งาน:
 * const authResult = await requireAuth(request);
 * if (!authResult.success) {
 *   return NextResponse.json({ error: authResult.error }, { status: authResult.status });
 * }
 * const user = authResult.user;
 */
export async function requireAuth(request: NextRequest): Promise<AuthResult> {
  try {
    // ดึง token จาก cookie
    const cookieStore = await cookies();
    const token = cookieStore.get('session_token')?.value;
    
    if (!token) {
      return {
        success: false,
        error: 'NO_SESSION',
        message: 'กรุณาเข้าสู่ระบบ',
        status: 401,
      };
    }
    
    // ค้นหา session จากฐานข้อมูล
    const session = await prisma.session.findUnique({
      where: { token: hashSessionToken(token) },
      include: { user: true },
    });
    
    // ตรวจสอบว่า session มีอยู่และยังใช้งานได้
    if (!session || !session.isValid) {
      cookieStore.delete('session_token');
      return {
        success: false,
        error: 'INVALID_SESSION',
        message: 'Session ไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่',
        status: 401,
      };
    }
    
    // ตรวจสอบว่า session หมดอายุหรือไม่
    if (new Date() > session.expiresAt) {
      await prisma.session.update({
        where: { id: session.id },
        data: { isValid: false },
      });
      
      cookieStore.delete('session_token');
      
      return {
        success: false,
        error: 'SESSION_EXPIRED',
        message: 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่',
        status: 401,
      };
    }
    
    // ตรวจสอบว่าผู้ใช้ยัง active อยู่หรือไม่
    if (!session.user.isActive) {
      return {
        success: false,
        error: 'ACCOUNT_DISABLED',
        message: 'บัญชีของคุณถูกปิดใช้งาน',
        status: 403,
      };
    }
    
    // บัญชีที่ยังตั้งค่าความปลอดภัยครั้งแรกไม่เสร็จ (ต้องเปลี่ยนรหัสผ่าน/ลงทะเบียน passkey): ใช้ได้เฉพาะ API ที่จำเป็นต่อการตั้งค่า
    // บังคับที่ server ทุก route ผ่านฟังก์ชันนี้ ไม่ใช่แค่ redirect ฝั่ง UI (ไม่งั้นเรียก API ตรงๆ ข้ามขั้นตอนได้)
    if (
      (session.user.mustChangePassword || session.user.forcePasskeySetup) &&
      !isSetupAllowedPath(request.nextUrl.pathname)
    ) {
      return {
        success: false,
        error: 'SETUP_REQUIRED',
        message: 'กรุณาตั้งค่าความปลอดภัยของบัญชีให้เสร็จก่อน (เปลี่ยนรหัสผ่านและลงทะเบียน passkey)',
        status: 403,
      };
    }

    // ฟีเจอร์ที่แอดมินปิดไว้ (หน้าตั้งค่า > ฟีเจอร์ของระบบ): API ของฟีเจอร์นั้นตอบ 403 ทุกเส้นที่ผ่านฟังก์ชันนี้
    // (ครอบ requirePermission ด้วย) — path ที่ไม่ใช่ของฟีเจอร์ที่ปิดได้ (users/auth/files ฯลฯ) ไม่ถูกตรวจ
    const ownerFeature = featureForApiPath(request.nextUrl.pathname);
    if (ownerFeature && !(await isFeatureEnabled(ownerFeature))) {
      return {
        success: false,
        error: 'FEATURE_DISABLED',
        message: 'ฟีเจอร์นี้ถูกปิดใช้งานโดยผู้ดูแลระบบ',
        status: 403,
      };
    }

    // ส่งกลับเฉพาะฟิลด์ที่อนุญาต (ไม่รวมรหัสผ่าน/TOTP secret/ข้อมูลส่วนตัวอื่น)
    const permissions = await resolvePermissions(session.user.id, session.user.role);

    return {
      success: true,
      user: toSessionUser(session.user, permissions),
    };
    
  } catch (error) {
    logger.error('Auth check error', { error });
    return {
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'เกิดข้อผิดพลาดภายในระบบ',
      status: 500,
    };
  }
}

/**
 * ฟังก์ชันสำหรับตรวจสอบสิทธิ์ของผู้ใช้
 * @param userRole - บทบาทของผู้ใช้ปัจจุบัน
 * @param allowedRoles - บทบาทที่อนุญาต
 * @returns {boolean} true หากมีสิทธิ์
 * 
 * ตัวอย่างการใช้งาน:
 * const hasPermission = checkRole(user.role, ['ADMIN', 'SUPER_ADMIN']);
 */
export function checkRole(userRole: UserRole, allowedRoles: UserRole[]): boolean {
  return allowedRoles.includes(userRole);
}

/**
 * ฟังก์ชันสำหรับตรวจสอบว่าผู้ใช้เป็น admin หรือไม่
 * @param userRole - บทบาทของผู้ใช้
 * @returns {boolean} true หากเป็น admin
 */
export function isAdmin(userRole: UserRole): boolean {
  return ['ADMIN', 'SUPER_ADMIN'].includes(userRole);
}

/**
 * ฟังก์ชันสำหรับตรวจสอบว่าผู้ใช้เป็น manager ขึ้นไปหรือไม่
 * @param userRole - บทบาทของผู้ใช้
 * @returns {boolean} true หากเป็น manager ขึ้นไป
 */
export function isManagerOrAbove(userRole: UserRole): boolean {
  return ['MANAGER', 'DIRECTOR', 'ADMIN', 'SUPER_ADMIN'].includes(userRole);
}

/**
 * ฟังก์ชันสำหรับตรวจสอบว่าผู้ใช้เป็น super admin หรือไม่ (สูงกว่า admin ทั่วไป)
 * @param userRole - บทบาทของผู้ใช้
 * @returns {boolean} true หากเป็น super admin
 */
export function isSuperAdmin(userRole: UserRole): boolean {
  return userRole === 'SUPER_ADMIN';
}

/**
 * รวมสิทธิ์ของผู้ใช้จาก RolePermission (default ตาม role) + UserPermission (override เฉพาะคน)
 * admin/super admin ไม่ต้อง query เพราะ hasPermission() ให้ผ่านเสมออยู่แล้ว (short-circuit)
 */
async function resolvePermissions(userId: number, role: UserRole): Promise<string[]> {
  if (isAdmin(role)) return [];

  const [roleGrants, userGrants] = await Promise.all([
    prisma.rolePermission.findMany({ where: { role }, select: { permissionKey: true } }),
    prisma.userPermission.findMany({ where: { userId }, select: { permissionKey: true, granted: true } }),
  ]);

  const keys = new Set(roleGrants.map((r) => r.permissionKey));
  for (const grant of userGrants) {
    if (grant.granted) keys.add(grant.permissionKey);
    else keys.delete(grant.permissionKey);
  }
  return [...keys];
}

/**
 * ฟังก์ชันสำหรับดึงข้อมูลผู้ใช้ปัจจุบัน
 * ห่อด้วย React cache() เพื่อ dedupe การเรียกซ้ำภายใน request เดียวกัน
 * (เช่น dashboard/layout.tsx เรียกครั้งหนึ่ง แล้วหน้าที่ gate สิทธิ์เพิ่ม เช่น
 * settings/permissions/page.tsx เรียกซ้ำอีกครั้ง - ไม่ต้อง query session/permission 2 รอบ)
 * @returns {Promise<SessionUser | null>} ข้อมูลผู้ใช้หรือ null หากไม่มี session
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('session_token')?.value;

    if (!token) {
      return null;
    }

    const session = await prisma.session.findUnique({
      where: { token: hashSessionToken(token) },
      include: { user: true },
    });

    if (!session || !session.isValid || new Date() > session.expiresAt) {
      return null;
    }

    if (!session.user.isActive) {
      return null;
    }

    const permissions = await resolvePermissions(session.user.id, session.user.role);
    return toSessionUser(session.user, permissions);

  } catch (error) {
    logger.error('Get current user error', { error });
    return null;
  }
});

/**
 * ตรวจสอบทั้ง session และ permission ในคำสั่งเดียว สำหรับ API route ที่ใช้ระบบ permission ใหม่
 * (route เดิมที่ใช้ isAdmin/isManagerOrAbove ไม่ต้องเปลี่ยนมาใช้ตัวนี้ - ยังทำงานแบบเดิมได้)
 */
export async function requirePermission(request: NextRequest, key: PermissionKey): Promise<AuthResult> {
  const authResult = await requireAuth(request);
  if (!authResult.success) return authResult;

  if (!hasPermission(authResult.user!, key)) {
    logger.warn('Permission denied', { userId: authResult.user!.id, key });
    return {
      success: false,
      error: 'FORBIDDEN',
      message: 'คุณไม่มีสิทธิ์ดำเนินการนี้',
      status: 403,
    };
  }

  return authResult;
}

/**
 * ฟังก์ชันสำหรับตรวจสอบ session โดยไม่ต้องใช้ NextRequest
 * ใช้สำหรับ Server Components
 * @returns {Promise<AuthResult>} ผลลัพธ์การตรวจสอบ
 */
export async function validateSession(): Promise<AuthResult> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('session_token')?.value;
    
    if (!token) {
      return {
        success: false,
        error: 'NO_SESSION',
        message: 'กรุณาเข้าสู่ระบบ',
        status: 401,
      };
    }
    
    const session = await prisma.session.findUnique({
      where: { token: hashSessionToken(token) },
      include: { user: true },
    });
    
    if (!session || !session.isValid) {
      cookieStore.delete('session_token');
      return {
        success: false,
        error: 'INVALID_SESSION',
        message: 'Session ไม่ถูกต้อง',
        status: 401,
      };
    }
    
    if (new Date() > session.expiresAt) {
      await prisma.session.update({
        where: { id: session.id },
        data: { isValid: false },
      });
      
      cookieStore.delete('session_token');
      
      return {
        success: false,
        error: 'SESSION_EXPIRED',
        message: 'Session หมดอายุ',
        status: 401,
      };
    }
    
    if (!session.user.isActive) {
      return {
        success: false,
        error: 'ACCOUNT_DISABLED',
        message: 'บัญชีถูกปิดใช้งาน',
        status: 403,
      };
    }
    
    const permissions = await resolvePermissions(session.user.id, session.user.role);

    return {
      success: true,
      user: toSessionUser(session.user, permissions),
    };

  } catch (error) {
    logger.error('Validate session error', { error });
    return {
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'เกิดข้อผิดพลาดภายในระบบ',
      status: 500,
    };
  }
}
