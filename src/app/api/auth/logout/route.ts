/**
 * ==================================================
 * API Route: POST /api/auth/logout
 * ==================================================
 * API สำหรับออกจากระบบและยกเลิก session
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashSessionToken } from '@/lib/security';
import { requireAuth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { cookies } from 'next/headers';

/**
 * POST /api/auth/logout
 * ออกจากระบบและยกเลิก session
 * 
 * Response:
 * {
 *   success: true,
 *   message: 'ออกจากระบบสำเร็จ'
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // ดึง token จาก cookie
    const cookieStore = await cookies();
    const token = cookieStore.get('session_token')?.value;
    
    if (token) {
      // ยกเลิก session ในฐานข้อมูล
      await prisma.session.updateMany({
        where: { token: hashSessionToken(token) },
        data: { isValid: false },
      });
      
      // ลบ cookie
      cookieStore.delete('session_token');
    }
    
    return NextResponse.json({
      success: true,
      message: 'ออกจากระบบสำเร็จ',
    });
    
  } catch (error) {
    logger.error('Logout error', { error });
    
    return NextResponse.json(
      {
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'เกิดข้อผิดพลาดภายในระบบ',
      },
      { status: 500 }
    );
  }
}
