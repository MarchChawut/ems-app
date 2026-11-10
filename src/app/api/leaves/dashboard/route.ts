/**
 * ==================================================
 * API Route: GET /api/leaves/dashboard
 * ==================================================
 * API สำหรับดึงข้อมูลสถิติการลาแบบรายบุคคล
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isManagerOrAbove } from '@/lib/auth';
import { logger } from '@/lib/logger';

/**
 * GET /api/leaves/dashboard
 * ดึงข้อมูลสถิติการลาแบบรายบุคคล
 * 
 * Query Parameters:
 * - userId: กรองตามผู้ใช้ (optional)
 * - year: ปีที่ต้องการดู (default: ปีปัจจุบัน)
 * 
 * Response:
 * {
 *   success: true,
 *   data: {
 *     users: [
 *       {
 *         user: { id, name, avatar, department },
 *         stats: {
 *           totalLeaves: number,
 *           sickDays: number,
 *           personalDays: number,
 *           pending: number,
 *           approved: number,
 *           rejected: number
 *         }
 *       }
 *     ],
 *     summary: {
 *       totalEmployees: number,
 *       totalLeaveDays: number,
 *       mostLeaveType: string
 *     }
 *   }
 * }
 */
export async function GET(request: NextRequest) {
  try {
    // ตรวจสอบการเข้าสู่ระบบ
    const authResult = await requireAuth(request);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, error: authResult.error, message: authResult.message },
        { status: authResult.status }
      );
    }

    // ดึง query parameters
    const { searchParams } = new URL(request.url);
    // ถ้าไม่ใช่ manager ขึ้นไป บังคับดูได้แค่ของตัวเอง (ไม่สนใจ userId ที่ส่งมา ป้องกันการสวมสิทธิ์ดูของคนอื่น)
    const userId = isManagerOrAbove(authResult.user!.role)
      ? searchParams.get('userId')
      : String(authResult.user!.id);
    const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString());

    // กำหนดช่วงวันที่
    const startOfYear = new Date(year, 0, 1);
    const endOfYear = new Date(year, 11, 31, 23, 59, 59);

    // ดึงรายชื่อผู้ใช้ทั้งหมดที่ active + ข้อมูลการลาทั้งหมดในปีที่ระบุ (query อิสระต่อกัน รันพร้อมกันได้)
    const [users, leaves] = await Promise.all([
      prisma.user.findMany({
        where: {
          isActive: true,
          ...(userId ? { id: parseInt(userId) } : {}),
        },
        select: {
          id: true,
          prefix: true,
          name: true,
          avatar: true,
          department: true,
        },
        orderBy: { name: 'asc' },
      }),
      prisma.leave.findMany({
        where: {
          startDate: {
            gte: startOfYear,
            lte: endOfYear,
          },
          ...(userId ? { userId: parseInt(userId) } : {}),
        },
        include: {
          user: {
            select: {
              id: true,
              prefix: true,
              name: true,
              avatar: true,
              department: true,
            },
          },
        },
      }),
    ]);

    // คำนวณสถิติรายบุคคล
    const userStats = users.map(user => {
      const userLeaves = leaves.filter(l => l.userId === user.id);
      
      // คำนวณจำนวนวันลาแต่ละประเภท
      const calculateDays = (leave: typeof userLeaves[0]) => {
        const start = new Date(leave.startDate);
        const end = new Date(leave.endDate);
        return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      };

      const sickLeaves = userLeaves.filter(l => l.type === 'SICK');
      const personalLeaves = userLeaves.filter(l => l.type === 'PERSONAL');

      return {
        user,
        stats: {
          totalLeaves: userLeaves.length,
          sickDays: sickLeaves.reduce((sum, l) => sum + calculateDays(l), 0),
          personalDays: personalLeaves.reduce((sum, l) => sum + calculateDays(l), 0),
          // นับรวมทุกสถานะที่ยังไม่จบกระบวนการ (รอธุรการ/หัวหน้างาน/ผอ.กอง) เป็น "pending"
          pending: userLeaves.filter(l =>
            l.status === 'PENDING' || l.status === 'ADMIN_REVIEWED' || l.status === 'SUPERVISOR_APPROVED'
          ).length,
          approved: userLeaves.filter(l => l.status === 'APPROVED').length,
          rejected: userLeaves.filter(l => l.status === 'REJECTED').length,
          totalDays: userLeaves.reduce((sum, l) => sum + calculateDays(l), 0),
        },
      };
    });

    // สรุปข้อมูลรวม
    const totalLeaveDays = leaves.reduce((sum, l) => {
      const start = new Date(l.startDate);
      const end = new Date(l.endDate);
      return sum + Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    }, 0);

    // หาประเภทการลาที่มากที่สุด
    const leaveTypeCount: Record<string, number> = {};
    leaves.forEach(l => {
      leaveTypeCount[l.type] = (leaveTypeCount[l.type] || 0) + 1;
    });
    const mostLeaveType = Object.entries(leaveTypeCount)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'ไม่มีข้อมูล';

    return NextResponse.json({
      success: true,
      data: {
        users: userStats,
        summary: {
          totalEmployees: users.length,
          totalLeaveDays,
          mostLeaveType,
          year,
        },
      },
    });

  } catch (error) {
    logger.error('Leave dashboard error', { error });
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
