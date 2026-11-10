/**
 * ==================================================
 * API Route: /api/feature-settings
 * ==================================================
 * GET   สถานะเปิด/ปิด + ตัวเลือก + ค่าเริ่มต้นของทุกฟีเจอร์ (ผู้ล็อกอินทุกคน)
 * PATCH แก้ฟีเจอร์เดียว { featureKey, enabled?, options?, config? } — เฉพาะ SUPER_ADMIN (ADMIN ธรรมดาและสิทธิ์รายบุคคลไม่พอ)
 *   ฟีเจอร์หลัก (พนักงาน/โปรไฟล์/ความปลอดภัย/ตั้งค่า) ไม่อยู่ในทะเบียน จึงปิดไม่ได้
 *   ปิดฟีเจอร์ = ปิดการเข้าถึงเท่านั้น ไม่ลบข้อมูล
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { featurePatchSchema, validateFeaturePatch, resolveFeatures, canManageFeatures } from '@/lib/features';
import { getFeatureSettings, clearFeatureCache } from '@/lib/feature-settings-server';
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
    return NextResponse.json({ success: true, data: await getFeatureSettings() });
  } catch (error) {
    logger.error('Get feature settings error', { error });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, error: authResult.error, message: authResult.message },
        { status: authResult.status }
      );
    }
    if (!canManageFeatures(authResult.user!.role)) {
      logger.warn('Feature settings change denied (super admin only)', { userId: authResult.user!.id, role: authResult.user!.role });
      return NextResponse.json(
        { success: false, error: 'FORBIDDEN', message: 'เฉพาะ Super Admin เท่านั้นที่เปิด/ปิดฟีเจอร์ได้' },
        { status: 403 }
      );
    }

    const parsed = featurePatchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'VALIDATION_ERROR', message: 'ข้อมูลไม่ถูกต้อง', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const patch = parsed.data;
    const problem = validateFeaturePatch(patch);
    if (problem) {
      return NextResponse.json({ success: false, error: 'VALIDATION_ERROR', message: problem }, { status: 400 });
    }

    // รวมกับค่าที่เก็บไว้เดิม (ส่งมาเฉพาะที่แก้ได้)
    const existing = await prisma.featureSetting.findUnique({ where: { featureKey: patch.featureKey } });
    const current = resolveFeatures(existing ? [existing] : [])[patch.featureKey as keyof ReturnType<typeof resolveFeatures>];
    const next = {
      enabled: patch.enabled ?? current.enabled,
      options: { ...current.options, ...(patch.options ?? {}) },
      config: { ...current.config, ...(patch.config ?? {}) },
    };

    await prisma.featureSetting.upsert({
      where: { featureKey: patch.featureKey },
      update: { ...next, updatedById: authResult.user!.id },
      create: { featureKey: patch.featureKey, ...next, updatedById: authResult.user!.id },
    });
    clearFeatureCache();

    logger.info('Feature setting updated', {
      userId: authResult.user!.id,
      featureKey: patch.featureKey,
      before: { enabled: current.enabled, options: current.options, config: current.config },
      after: next,
    });
    return NextResponse.json({
      success: true,
      data: await getFeatureSettings(),
      message: 'บันทึกการตั้งค่าฟีเจอร์สำเร็จ',
    });
  } catch (error) {
    logger.error('Update feature settings error', { error });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      { status: 500 }
    );
  }
}
