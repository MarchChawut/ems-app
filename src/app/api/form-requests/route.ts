/**
 * ==================================================
 * API Route: /api/form-requests
 * ==================================================
 * GET รายการแบบฟอร์มขอเอกสารภายใน / POST สร้างแบบฟอร์มใหม่
 */

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { canUseFormTemplate } from '@/lib/permissions';
import { logger } from '@/lib/logger';
import { getOrgSettings } from '@/lib/org-settings-server';
import { applyOrgToVehicleFields } from '@/lib/vehicle-request';
import { toSafeGregorianDate } from '@/lib/utils';
import { formRequestEnvelopeSchema, buildTemplateDataSchema } from '@/lib/dynamic-form-validation';
import { listFormRequests, resolveVehicleRequester, FORM_REQUEST_INCLUDE as INCLUDE_REQUESTER_AND_TEMPLATE } from '@/lib/form-requests';
import { VEHICLE_REQUEST_SYSTEM_KEY } from '@/lib/vehicle-request';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, error: authResult.error, message: authResult.message },
        { status: authResult.status }
      );
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const userId = searchParams.get('userId');
    const skipParam = searchParams.get('skip');
    const page = parseInt(searchParams.get('page') || '1') || 1;
    const limit = parseInt(searchParams.get('limit') || '50') || 50;

    const { formRequests, meta } = await listFormRequests(authResult.user!, {
      skip: skipParam !== null ? parseInt(skipParam) || 0 : undefined,
      page,
      limit,
      userId: userId ? parseInt(userId) : undefined,
      type: type ?? undefined,
    });

    return NextResponse.json({ success: true, data: formRequests, meta });
  } catch (error) {
    logger.error('Get form requests error', { error });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, error: authResult.error, message: authResult.message },
        { status: authResult.status }
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

    if (!template.isActive) {
      return NextResponse.json(
        { success: false, error: 'TEMPLATE_INACTIVE', message: 'แบบฟอร์มนี้ปิดใช้งานแล้ว' },
        { status: 400 }
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

    const data: Prisma.FormRequestUncheckedCreateInput = {
      // systemKey ตั้งได้เฉพาะจาก prisma/seed.ts เท่านั้น (createTemplateSchema ไม่ expose field นี้ให้ client ตั้งเอง)
      // จึงมั่นใจได้ว่าค่าตรงกับ FormRequestType enum เสมอ ไม่ต้อง validate ซ้ำตรงนี้
      type: (template.systemKey as Prisma.FormRequestUncheckedCreateInput['type']) ?? null,
      templateId: template.id,
      status: 'PENDING',
      requestDate: toSafeGregorianDate(envelope.data.requestDate),
      documentNumber: envelope.data.documentNumber,
      data: savedData as Prisma.InputJsonValue,
      requestedById: authResult.user!.id,
    };

    const formRequest = await prisma.formRequest.create({
      data,
      include: INCLUDE_REQUESTER_AND_TEMPLATE,
    });

    return NextResponse.json({
      success: true,
      data: formRequest,
      message: 'บันทึกแบบฟอร์มสำเร็จ',
    }, { status: 201 });
  } catch (error) {
    logger.error('Create form request error', { error });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      { status: 500 }
    );
  }
}
