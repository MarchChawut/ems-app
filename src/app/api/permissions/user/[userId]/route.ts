/**
 * ==================================================
 * API Route: /api/permissions/user/[userId]
 * ==================================================
 * GET สิทธิ์ของผู้ใช้คนหนึ่ง (default ตาม role + override เฉพาะคน)
 * PUT ตั้ง/ยกเลิก override สิทธิ์ของผู้ใช้คนนี้ 1 รายการ
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission, isAdmin } from '@/lib/auth';
import { PERMISSIONS, ALL_PERMISSION_KEYS } from '@/lib/permissions';
import { logger } from '@/lib/logger';

const putSchema = z.object({
  permissionKey: z.enum(ALL_PERMISSION_KEYS as [string, ...string[]]),
  // true = ให้สิทธิ์เพิ่มนอกเหนือ role, false = ตัดสิทธิ์ที่ role ให้, null = ลบ override (กลับไปใช้ค่า default ของ role)
  granted: z.boolean().nullable(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const authResult = await requirePermission(request, PERMISSIONS.PERMISSIONS_MANAGE);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, error: authResult.error, message: authResult.message },
        { status: authResult.status }
      );
    }

    const { userId } = await params;
    const targetUserId = parseInt(userId);
    if (isNaN(targetUserId)) {
      return NextResponse.json(
        { success: false, error: 'INVALID_ID', message: 'รหัสผู้ใช้ไม่ถูกต้อง' },
        { status: 400 }
      );
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, role: true },
    });
    if (!targetUser) {
      return NextResponse.json(
        { success: false, error: 'NOT_FOUND', message: 'ไม่พบผู้ใช้' },
        { status: 404 }
      );
    }

    const [roleGrants, userGrants] = await Promise.all([
      prisma.rolePermission.findMany({ where: { role: targetUser.role }, select: { permissionKey: true } }),
      prisma.userPermission.findMany({
        where: { userId: targetUserId },
        select: { permissionKey: true, granted: true },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        role: targetUser.role,
        roleDefaults: roleGrants.map((r) => r.permissionKey),
        overrides: userGrants,
      },
    });
  } catch (error) {
    logger.error('Get user permissions error', { error });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const authResult = await requirePermission(request, PERMISSIONS.PERMISSIONS_MANAGE);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, error: authResult.error, message: authResult.message },
        { status: authResult.status }
      );
    }

    const { userId } = await params;
    const targetUserId = parseInt(userId);
    if (isNaN(targetUserId)) {
      return NextResponse.json(
        { success: false, error: 'INVALID_ID', message: 'รหัสผู้ใช้ไม่ถูกต้อง' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const result = putSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: 'VALIDATION_ERROR', message: 'ข้อมูลไม่ถูกต้อง', details: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { permissionKey, granted } = result.data;

    // permissions.manage ให้สิทธิ์แก้ permission ของทุกคนรวมถึงตัวเอง — ถ้าผู้ที่ได้สิทธิ์นี้ผ่าน
    // override (ไม่ใช่ ADMIN/SUPER_ADMIN โดย role) แก้ permission.manage ได้เอง จะกลาย
    // เป็นวงวนยกระดับสิทธิ์ตัวเองแบบไม่มีเพดาน จึงสงวนการแก้ permission นี้ไว้เฉพาะ admin จริงเท่านั้น
    if (permissionKey === PERMISSIONS.PERMISSIONS_MANAGE && !isAdmin(authResult.user!.role)) {
      logger.warn('Blocked non-admin attempt to modify permissions.manage', {
        actorId: authResult.user!.id,
        targetUserId,
      });
      return NextResponse.json(
        { success: false, error: 'FORBIDDEN', message: 'เฉพาะผู้ดูแลระบบเท่านั้นที่แก้ไขสิทธิ์นี้ได้' },
        { status: 403 }
      );
    }

    if (granted === null) {
      // ลบ override -> กลับไปใช้ค่า default ของ role
      await prisma.userPermission.deleteMany({ where: { userId: targetUserId, permissionKey } });
      logger.info('Permission override reset to role default', {
        actorId: authResult.user!.id,
        targetUserId,
        permissionKey,
      });
      return NextResponse.json({ success: true, message: 'รีเซ็ตกลับเป็นค่าเริ่มต้นของ role แล้ว' });
    }

    const grant = await prisma.userPermission.upsert({
      where: { userId_permissionKey: { userId: targetUserId, permissionKey } },
      update: { granted, grantedById: authResult.user!.id },
      create: { userId: targetUserId, permissionKey, granted, grantedById: authResult.user!.id },
    });

    logger.info('Permission grant updated', {
      actorId: authResult.user!.id,
      targetUserId,
      permissionKey,
      granted,
    });

    return NextResponse.json({ success: true, data: grant, message: 'บันทึกสิทธิ์สำเร็จ' });
  } catch (error: any) {
    if (error?.code === 'P2003') {
      return NextResponse.json(
        { success: false, error: 'NOT_FOUND', message: 'ไม่พบผู้ใช้' },
        { status: 404 }
      );
    }
    logger.error('Update user permission error', { error });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      { status: 500 }
    );
  }
}
