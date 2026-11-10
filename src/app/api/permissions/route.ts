/**
 * ==================================================
 * API Route: /api/permissions
 * ==================================================
 * GET รายการสิทธิ์ทั้งหมด (catalog) + ค่า default ตาม role ปัจจุบัน
 * ใช้โดยหน้า admin จัดการสิทธิ์ (/dashboard/settings/permissions)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { ALL_PERMISSION_KEYS, PERMISSIONS } from '@/lib/permissions';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, PERMISSIONS.PERMISSIONS_MANAGE);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, error: authResult.error, message: authResult.message },
        { status: authResult.status }
      );
    }

    const rolePermissionRows = await prisma.rolePermission.findMany({
      select: { role: true, permissionKey: true },
    });

    const roleDefaults: Record<string, string[]> = {};
    for (const row of rolePermissionRows) {
      (roleDefaults[row.role] ??= []).push(row.permissionKey);
    }

    return NextResponse.json({
      success: true,
      data: {
        catalog: ALL_PERMISSION_KEYS,
        roleDefaults,
      },
    });
  } catch (error) {
    logger.error('Get permissions catalog error', { error });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      { status: 500 }
    );
  }
}
