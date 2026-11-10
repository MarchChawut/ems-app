/**
 * ==================================================
 * API Route: GET /api/dashboard
 * ==================================================
 * API สำหรับดึงข้อมูลสถิติแดชบอร์ด
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { getFeatureSettings } from '@/lib/feature-settings-server';

/**
 * GET /api/dashboard
 * ดึงข้อมูลสถิติสำหรับแดชบอร์ด
 * 
 * Response:
 * {
 *   success: true,
 *   data: {
 *     stats: {
 *       totalUsers: number;
 *       activeUsers: number;
 *       pendingLeaves: number;
 *       totalLeaves: number;
 *       totalTasks: number;
 *       tasksByColumn: { columnId, columnName, count }[];
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

    // ข้อมูลสรุประดับกอง (ใบลา/คลัง/ครุภัณฑ์ของทุกคน) — พนักงานทั่วไปไม่มีสิทธิ์ (หน้าแดชบอร์ดก็ redirect EMPLOYEE ออกอยู่แล้ว
    // แต่ต้องกันที่ API ด้วย ไม่ใช่แค่ซ่อน UI)
    if (authResult.user!.role === 'EMPLOYEE') {
      return NextResponse.json(
        { success: false, error: 'FORBIDDEN', message: 'คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้' },
        { status: 403 }
      );
    }

    // ฟีเจอร์ที่แอดมินปิดไว้ — ข้ามคิวรีของฟีเจอร์นั้น (คืนค่าว่าง/0) ไม่ให้ทั้งหน้าหลักพังเพราะฟีเจอร์เดียวปิด
    const features = await getFeatureSettings();
    const on = {
      leaves: features.leaves.enabled,
      tasks: features.tasks.enabled,
      supplies: features.supplies.enabled,
      assets: features.assets.enabled,
    };

    // ดึงข้อมูลสถิติพร้อมกัน
    const [
      totalUsers,
      activeUsers,
      pendingLeaves,
      totalLeaves,
      totalTasks,
      columns,
      stockSupplies,
      assetsInUse,
      assetsInRepair,
      overdueCheckoutsRows,
      overdueCheckoutsCount,
    ] = await Promise.all([
      // จำนวนผู้ใช้ทั้งหมด
      prisma.user.count(),

      // จำนวนผู้ใช้ที่ active
      prisma.user.count({ where: { isActive: true } }),

      // จำนวนการลาที่รออนุมัติ
      on.leaves ? prisma.leave.count({ where: { status: 'PENDING' } }) : Promise.resolve(0),

      // จำนวนการลาทั้งหมด
      on.leaves ? prisma.leave.count() : Promise.resolve(0),

      // จำนวนงานทั้งหมด
      // นับเฉพาะงานส่วนรวม (ownerId = null) — งานส่วนตัวของแต่ละคนไม่รวมในสถิติของแดชบอร์ด
      on.tasks ? prisma.task.count({ where: { ownerId: null } }) : Promise.resolve(0),

      // คอลัมน์ทั้งหมดพร้อมจำนวนงาน
      on.tasks
        ? prisma.kanbanColumn.findMany({
            include: {
              _count: {
                select: { tasks: { where: { ownerId: null } } },
              },
            },
            orderBy: { order: 'asc' },
          })
        : Promise.resolve([]),

      // พัสดุประเภท STOCK ทั้งหมด (กรองใกล้หมดใน JS)
      on.supplies
        ? prisma.supply.findMany({
            where: { isActive: true, type: 'STOCK' },
            include: {
              category: { select: { id: true, name: true } },
            },
          })
        : Promise.resolve([]),

      // ครุภัณฑ์ที่กำลังใช้งานอยู่
      on.assets ? prisma.asset.count({ where: { isActive: true, status: 'IN_USE' } }) : Promise.resolve(0),

      // ครุภัณฑ์ที่กำลังซ่อม
      on.assets ? prisma.asset.count({ where: { isActive: true, status: 'IN_REPAIR' } }) : Promise.resolve(0),

      // รายการยืมครุภัณฑ์ที่เกินกำหนดคืน (top 5)
      on.assets
        ? prisma.assetCheckout.findMany({
            where: { returnedAt: null, expectedReturnAt: { lt: new Date() } },
            include: {
              asset: { select: { id: true, name: true, assetTag: true } },
              holder: { select: { id: true, name: true, avatar: true, department: true } },
            },
            orderBy: { expectedReturnAt: 'asc' },
            take: 5,
          })
        : Promise.resolve([]),

      // จำนวนรวมของรายการยืมครุภัณฑ์ที่เกินกำหนดคืน
      on.assets
        ? prisma.assetCheckout.count({
            where: { returnedAt: null, expectedReturnAt: { lt: new Date() } },
          })
        : Promise.resolve(0),
    ]);

    // แปลงข้อมูล tasksByColumn
    const tasksByColumn = columns.map(col => ({
      columnId: col.id,
      columnName: col.name,
      count: col._count.tasks,
    }));

    // กรองพัสดุใกล้หมด (currentQuantity <= minimumQuantity)
    const lowStockSuppliesAll = stockSupplies
      .filter(s => s.currentQuantity <= s.minimumQuantity)
      .sort((a, b) => (a.currentQuantity - a.minimumQuantity) - (b.currentQuantity - b.minimumQuantity));

    const lowStockSupplies = lowStockSuppliesAll.slice(0, 5).map(s => ({
      id: s.id,
      name: s.name,
      unit: s.unit,
      currentQuantity: s.currentQuantity,
      minimumQuantity: s.minimumQuantity,
      category: s.category,
    }));

    // ดึงข้อมูลการลาล่าสุดที่รออนุมัติ (5 รายการ)
    const recentPendingLeaves = !on.leaves ? [] : await prisma.leave.findMany({
      where: { status: 'PENDING' },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
            department: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    // ดึงข้อมูลงานล่าสุด (5 รายการ)
    const recentTasks = !on.tasks ? [] : await prisma.task.findMany({
      where: { ownerId: null }, // งานส่วนตัวห้ามโผล่ในแดชบอร์ด
      include: {
        column: true,
        assignee: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    return NextResponse.json({
      success: true,
      data: {
        // ฟีเจอร์ที่เปิดอยู่ — หน้าหลักใช้ซ่อนวิดเจ็ตของฟีเจอร์ที่ปิด
        enabledFeatures: on,
        stats: {
          totalUsers,
          activeUsers,
          pendingLeaves,
          totalLeaves,
          totalTasks,
          tasksByColumn,
          lowStockCount: lowStockSuppliesAll.length,
          assetsInUse,
          assetsInRepair,
          overdueCheckoutsCount,
        },
        recentPendingLeaves,
        recentTasks,
        lowStockSupplies,
        overdueCheckouts: overdueCheckoutsRows,
      },
    });

  } catch (error) {
    logger.error('Dashboard error', { error });
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
