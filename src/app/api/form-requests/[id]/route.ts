/**
 * ==================================================
 * API Route: /api/form-requests/[id]
 * ==================================================
 * GET / PATCH / DELETE แบบฟอร์มขอเอกสารภายในรายการเดียว
 */

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAuth, isManagerOrAbove, isAdmin } from '@/lib/auth';
import { canUseFormTemplate } from '@/lib/permissions';
import { resolveVehicleRequester } from '@/lib/form-requests';
import { VEHICLE_REQUEST_SYSTEM_KEY } from '@/lib/vehicle-request';
import { logger } from '@/lib/logger';
import { getOrgSettings } from '@/lib/org-settings-server';
import { applyOrgToVehicleFields } from '@/lib/vehicle-request';
import { toSafeGregorianDate } from '@/lib/utils';
import { formRequestEnvelopeSchema, buildTemplateDataSchema } from '@/lib/dynamic-form-validation';

const INCLUDE_REQUESTER = {
  requestedBy: { select: { id: true, prefix: true, name: true, position: true, department: true, division: true, avatar: true, signatureFileId: true } },
  template: { include: { fields: { orderBy: { order: 'asc' as const } } } },
} as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth(request);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, error: authResult.error, message: authResult.message },
        { status: authResult.status }
      );
    }

    const { id } = await params;
    const formRequestId = parseInt(id);
    if (isNaN(formRequestId)) {
      return NextResponse.json(
        { success: false, error: 'INVALID_ID', message: 'รหัสแบบฟอร์มไม่ถูกต้อง' },
        { status: 400 }
      );
    }

    const formRequest = await prisma.formRequest.findUnique({
      where: { id: formRequestId },
      include: INCLUDE_REQUESTER,
    });

    if (!formRequest) {
      return NextResponse.json(
        { success: false, error: 'NOT_FOUND', message: 'ไม่พบแบบฟอร์ม' },
        { status: 404 }
      );
    }

    const currentUser = authResult.user!;
    if (formRequest.requestedById !== currentUser.id && !isManagerOrAbove(currentUser.role)) {
      return NextResponse.json(
        { success: false, error: 'FORBIDDEN', message: 'คุณไม่มีสิทธิ์เข้าถึงแบบฟอร์มนี้' },
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true, data: formRequest });
  } catch (error) {
    logger.error('Get form request error', { error });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth(request);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, error: authResult.error, message: authResult.message },
        { status: authResult.status }
      );
    }

    const { id } = await params;
    const formRequestId = parseInt(id);
    if (isNaN(formRequestId)) {
      return NextResponse.json(
        { success: false, error: 'INVALID_ID', message: 'รหัสแบบฟอร์มไม่ถูกต้อง' },
        { status: 400 }
      );
    }

    const currentUser = authResult.user!;
    if (!isAdmin(currentUser.role)) {
      return NextResponse.json(
        { success: false, error: 'FORBIDDEN', message: 'คุณไม่มีสิทธิ์แก้ไขแบบฟอร์มนี้' },
        { status: 403 }
      );
    }

    const existing = await prisma.formRequest.findUnique({ where: { id: formRequestId } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'NOT_FOUND', message: 'ไม่พบแบบฟอร์ม' },
        { status: 404 }
      );
    }

    // แก้ไขได้เฉพาะก่อนอนุมัติ/ไม่อนุมัติเท่านั้น (เหมือน leaves/[id]) ป้องกันการแก้ไขข้อมูล
    // ย้อนหลังหลังจากที่มีการพิจารณาไปแล้ว ซึ่งจะทำให้สิ่งที่อนุมัติไปไม่ตรงกับข้อมูลจริง
    if (existing.status !== 'PENDING') {
      return NextResponse.json(
        {
          success: false,
          error: 'FORM_REQUEST_ALREADY_REVIEWED',
          message: 'ไม่สามารถแก้ไขได้ เนื่องจากมีการพิจารณาไปแล้ว',
        },
        { status: 400 }
      );
    }

    const body = await request.json();
    const envelope = formRequestEnvelopeSchema.safeParse(body);
    if (!envelope.success) {
      return NextResponse.json(
        { success: false, error: 'VALIDATION_ERROR', message: 'ข้อมูลไม่ถูกต้อง', details: envelope.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const templateRow = await prisma.formTemplate.findUnique({
      where: { id: envelope.data.templateId },
      include: { fields: true },
    });
    // ตัวเลือก "ส่วนราชการ" ของใบขอรถยนต์ใช้ชื่อสังกัดปัจจุบันจากข้อมูลหน่วยงานหลัก (ไม่ใช่ค่าตอน seed)
    const template = templateRow ? applyOrgToVehicleFields(templateRow, await getOrgSettings()) : null;
    if (!template) {
      return NextResponse.json(
        { success: false, error: 'NOT_FOUND', message: 'ไม่พบแบบฟอร์มนี้' },
        { status: 404 }
      );
    }

    if (!canUseFormTemplate(authResult.user!, template.systemKey)) {
      return NextResponse.json(
        { success: false, error: 'FORBIDDEN', message: 'คุณไม่มีสิทธิ์ใช้แบบฟอร์มนี้' },
        { status: 403 }
      );
    }

    const dataSchema = buildTemplateDataSchema(template.fields);
    const dataResult = dataSchema.safeParse(body.data ?? {});
    if (!dataResult.success) {
      return NextResponse.json(
        { success: false, error: 'VALIDATION_ERROR', message: 'ข้อมูลไม่ถูกต้อง', details: dataResult.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    let savedData: Record<string, unknown> = dataResult.data as Record<string, unknown>;
    if (template.systemKey === VEHICLE_REQUEST_SYSTEM_KEY) {
      const resolved = await resolveVehicleRequester(authResult.user!, savedData);
      if (!resolved.ok) {
        return NextResponse.json(
          { success: false, error: resolved.error, message: resolved.message },
          { status: resolved.status }
        );
      }
      savedData = resolved.data;
    }

    const formRequest = await prisma.formRequest.update({
      where: { id: formRequestId },
      data: {
        // systemKey ตั้งได้เฉพาะจาก prisma/seed.ts เท่านั้น (updateTemplateSchema ไม่ expose field นี้ให้ client ตั้งเอง)
        // จึงมั่นใจได้ว่าค่าตรงกับ FormRequestType enum เสมอ ไม่ต้อง validate ซ้ำตรงนี้
        type: (template.systemKey as Prisma.FormRequestUncheckedUpdateInput['type']) ?? null,
        templateId: template.id,
        requestDate: toSafeGregorianDate(envelope.data.requestDate),
        documentNumber: envelope.data.documentNumber,
        data: savedData as Prisma.InputJsonValue,
      },
      include: INCLUDE_REQUESTER,
    });

    return NextResponse.json({
      success: true,
      data: formRequest,
      message: 'อัปเดตแบบฟอร์มสำเร็จ',
    });
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return NextResponse.json(
        { success: false, error: 'NOT_FOUND', message: 'ไม่พบแบบฟอร์ม' },
        { status: 404 }
      );
    }
    logger.error('Update form request error', { error });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth(request);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, error: authResult.error, message: authResult.message },
        { status: authResult.status }
      );
    }

    const { id } = await params;
    const formRequestId = parseInt(id);
    if (isNaN(formRequestId)) {
      return NextResponse.json(
        { success: false, error: 'INVALID_ID', message: 'รหัสแบบฟอร์มไม่ถูกต้อง' },
        { status: 400 }
      );
    }

    const currentUser = authResult.user!;
    if (!isAdmin(currentUser.role)) {
      return NextResponse.json(
        { success: false, error: 'FORBIDDEN', message: 'คุณไม่มีสิทธิ์ลบแบบฟอร์มนี้' },
        { status: 403 }
      );
    }

    const existing = await prisma.formRequest.findUnique({ where: { id: formRequestId } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'NOT_FOUND', message: 'ไม่พบแบบฟอร์ม' },
        { status: 404 }
      );
    }

    await prisma.formRequest.delete({ where: { id: formRequestId } });

    return NextResponse.json({ success: true, message: 'ลบแบบฟอร์มสำเร็จ' });
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return NextResponse.json(
        { success: false, error: 'NOT_FOUND', message: 'ไม่พบแบบฟอร์ม' },
        { status: 404 }
      );
    }
    logger.error('Delete form request error', { error });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      { status: 500 }
    );
  }
}
