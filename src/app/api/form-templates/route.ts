/**
 * ==================================================
 * API Route: /api/form-templates
 * ==================================================
 * GET รายการแบบฟอร์ม (?active=true สำหรับพนักงานเลือกกรอก, ไม่ใส่ = ทั้งหมดสำหรับ admin จัดการ)
 * POST สร้างแบบฟอร์มใหม่ (เฉพาะผู้มีสิทธิ์ forms.manage_templates)
 */

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth, requirePermission } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/permissions';
import { listActiveFormTemplates, listAllFormTemplates } from '@/lib/form-templates';
import { logger } from '@/lib/logger';

const fieldSchema = z.object({
  key: z
    .string()
    .min(1, 'กรุณาระบุ key')
    .max(100)
    .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'key ต้องขึ้นต้นด้วยตัวอักษร และมีเฉพาะ a-z, A-Z, 0-9, _'),
  label: z.string().min(1, 'กรุณาระบุป้ายกำกับ').max(200),
  inputType: z.enum(['text', 'number', 'time', 'date', 'textarea', 'select', 'checkbox', 'tel', 'user']).default('text'),
  required: z.boolean().default(false),
  order: z.number().int().default(0),
  options: z.array(z.string().max(200)).max(50).nullable().optional(),
});

const createTemplateSchema = z.object({
  menuTitle: z.string().min(1, 'กรุณาระบุชื่อเมนู').max(200),
  documentTitle: z.string().min(1, 'กรุณาระบุชื่อเรื่อง').max(300),
  isActive: z.boolean().default(true),
  fields: z.array(fieldSchema).min(1, 'ต้องมีอย่างน้อย 1 field').max(50, 'มี field ได้สูงสุด 50 รายการ'),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get('active') === 'true';

    // ?active=true (พนักงานเลือกกรอก) แค่ล็อกอินก็ดูได้ / list เต็ม (รวม draft/inactive) เฉพาะผู้จัดการแบบฟอร์ม
    const authResult = activeOnly
      ? await requireAuth(request)
      : await requirePermission(request, PERMISSIONS.FORMS_MANAGE_TEMPLATES);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, error: authResult.error, message: authResult.message },
        { status: authResult.status }
      );
    }

    const data = activeOnly ? await listActiveFormTemplates() : await listAllFormTemplates();

    return NextResponse.json({ success: true, data });
  } catch (error) {
    logger.error('Get form templates error', { error });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, PERMISSIONS.FORMS_MANAGE_TEMPLATES);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, error: authResult.error, message: authResult.message },
        { status: authResult.status }
      );
    }

    const body = await request.json();
    const result = createTemplateSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: 'VALIDATION_ERROR', message: 'ข้อมูลไม่ถูกต้อง', details: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { fields, ...templateData } = result.data;

    const keys = fields.map((f) => f.key);
    if (new Set(keys).size !== keys.length) {
      return NextResponse.json(
        { success: false, error: 'VALIDATION_ERROR', message: 'key ของ field ต้องไม่ซ้ำกัน' },
        { status: 400 }
      );
    }

    // createMany แทน nested create ทีละแถว - กัน transaction timeout เมื่อมี field จำนวนมาก (สูงสุด 50)
    const template = await prisma.$transaction(async (tx) => {
      const created = await tx.formTemplate.create({ data: templateData });
      await tx.formTemplateField.createMany({
        data: fields.map((f, i) => ({ ...f, order: f.order ?? i, templateId: created.id, options: f.options ?? Prisma.JsonNull })),
      });
      return tx.formTemplate.findUniqueOrThrow({
        where: { id: created.id },
        include: { fields: { orderBy: { order: 'asc' } } },
      });
    });

    return NextResponse.json(
      { success: true, data: { ...template, submissionCount: 0 }, message: 'สร้างแบบฟอร์มสำเร็จ' },
      { status: 201 }
    );
  } catch (error) {
    logger.error('Create form template error', { error });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      { status: 500 }
    );
  }
}
