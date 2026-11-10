/**
 * ==================================================
 * API Route: /api/org-settings
 * ==================================================
 * GET   ชื่อสังกัด/ชื่อกองหลักปัจจุบัน (ผู้ล็อกอินทุกคน)
 * PATCH แก้ชื่อ (เฉพาะผู้มีสิทธิ์ org.manage — แอดมินผ่านเสมอ)
 *   เปลี่ยนชื่อแล้ว ผู้ใช้ที่ใช้ชื่อเดิมอยู่ถูกอัปเดตตามอัตโนมัติ (ใน transaction เดียวกัน) ส่วนผู้ช่วยราชการ
 *   ที่มีสังกัด/กองของตัวเองไม่ถูกแตะ
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, requirePermission } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/permissions';
import { orgSettingSchema, DEFAULT_ORG } from '@/lib/org-settings';
import { getOrgSettings, ORG_SETTING_ID } from '@/lib/org-settings-server';
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
    return NextResponse.json({ success: true, data: await getOrgSettings() });
  } catch (error) {
    logger.error('Get org settings error', { error });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, PERMISSIONS.ORG_MANAGE);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, error: authResult.error, message: authResult.message },
        { status: authResult.status }
      );
    }

    const parsed = orgSettingSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const { divisionName, departmentName } = parsed.data;

    const result = await prisma.$transaction(async (tx) => {
      // สร้างแถวถ้ายังไม่มี แล้ว "ล็อกแถว" ก่อนอ่านชื่อเดิม (SELECT … FOR UPDATE = current read)
      // กัน PATCH สองคำขอพร้อมกันอ่านชื่อเดิมค่าเดียวกัน (REPEATABLE READ snapshot) แล้ว cascade ผิดชื่อ
      await tx.orgSetting.upsert({ where: { id: ORG_SETTING_ID }, update: {}, create: { id: ORG_SETTING_ID, ...DEFAULT_ORG } });
      const [locked] = await tx.$queryRaw<{ divisionName: string; departmentName: string }[]>`
        SELECT divisionName, departmentName FROM org_settings WHERE id = ${ORG_SETTING_ID} FOR UPDATE
      `;
      const old = locked ?? { ...DEFAULT_ORG };
      const next = {
        divisionName: divisionName ?? old.divisionName,
        departmentName: departmentName ?? old.departmentName,
      };

      await tx.orgSetting.upsert({
        where: { id: ORG_SETTING_ID },
        update: { ...next, updatedById: authResult.user!.id },
        create: { id: ORG_SETTING_ID, ...next, updatedById: authResult.user!.id },
      });

      let divisionUsers = 0;
      let departmentUsers = 0;
      if (next.divisionName !== old.divisionName) {
        divisionUsers = (await tx.user.updateMany({ where: { division: old.divisionName }, data: { division: next.divisionName } })).count;
      }
      if (next.departmentName !== old.departmentName) {
        departmentUsers = (await tx.user.updateMany({ where: { department: old.departmentName }, data: { department: next.departmentName } })).count;
        // รายการ "แผนก/กอง" ในหน้าพนักงานที่ชื่อตรงกับกองเดิม เปลี่ยนชื่อตาม (ข้ามถ้าชื่อใหม่ซ้ำกับรายการที่มีอยู่)
        const clash = await tx.department.findUnique({ where: { name: next.departmentName } });
        if (!clash) {
          await tx.department.updateMany({ where: { name: old.departmentName }, data: { name: next.departmentName } });
        }
      }

      return { org: next, divisionUsers, departmentUsers };
    });

    logger.info('Org settings updated', { userId: authResult.user!.id, divisionName: result.org.divisionName, departmentName: result.org.departmentName, divisionUsers: result.divisionUsers, departmentUsers: result.departmentUsers });
    return NextResponse.json({
      success: true,
      data: result.org,
      meta: { divisionUsers: result.divisionUsers, departmentUsers: result.departmentUsers },
      message: 'บันทึกข้อมูลหน่วยงานสำเร็จ',
    });
  } catch (error) {
    logger.error('Update org settings error', { error });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      { status: 500 }
    );
  }
}
