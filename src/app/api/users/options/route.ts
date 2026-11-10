/**
 * ==================================================
 * API Route: GET /api/users/options
 * ==================================================
 * รายชื่อผู้ใช้แบบ "ย่อ" สำหรับ dropdown/การค้นหาชื่อในหน้าต่างๆ (เช่น หน้าลา)
 * ส่งเฉพาะฟิลด์ที่ต้องใช้ แทน GET /api/users ที่คืนข้อมูลเต็ม (เบอร์โทร ที่อยู่ ฯลฯ) ทุกคนทุกครั้ง
 * รวมผู้ใช้ที่ถูกปิดใช้งานด้วย เพราะใบลาเก่าอาจอ้างถึงผู้ตรวจสอบ/หัวหน้างานที่ออกไปแล้ว (ใช้ isActive แยกเอง)
 *
 * Response: { success: true, data: { id, prefix, name, position, department, role, isActive, supervisorId }[] }
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
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

    // EMPLOYEE ไม่ใช่ทำเนียบพนักงาน: เห็นแค่ id/ชื่อ/สถานะ พอสำหรับ dropdown (เหมือน GET /api/users)
    // ไม่เห็นตำแหน่ง/กอง/role/หัวหน้างานของคนอื่น
    const isEmployee = authResult.user!.role === 'EMPLOYEE';
    const users = await prisma.user.findMany({
      select: isEmployee
        ? { id: true, prefix: true, name: true, isActive: true }
        : {
            id: true,
            prefix: true,
            name: true,
            position: true,
            department: true,
            role: true,
            isActive: true,
            supervisorId: true,
          },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({ success: true, data: users });
  } catch (error) {
    logger.error('Get user options error', { error });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      { status: 500 }
    );
  }
}
