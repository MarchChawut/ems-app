/**
 * ==================================================
 * API Route: /api/users/me
 * ==================================================
 * ดึงข้อมูลส่วนตัวของผู้ใช้ที่ล็อกอินอยู่ (read-only)
 * การแก้ไขข้อมูลยังทำผ่าน admin/HR ที่ /api/users/[id] เหมือนเดิม
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getFullProfile } from '@/lib/profile';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, error: authResult.error, message: authResult.message },
        { status: authResult.status }
      );
    }

    const user = await getFullProfile(authResult.user!.id);

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'NOT_FOUND', message: 'ไม่พบข้อมูลผู้ใช้' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: user });
  } catch (error) {
    logger.error('Get current user profile error', { error });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      { status: 500 }
    );
  }
}
