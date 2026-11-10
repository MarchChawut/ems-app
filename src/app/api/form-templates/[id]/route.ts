/**
 * ==================================================
 * API Route: /api/form-templates/[id]
 * ==================================================
 * GET / PATCH / DELETE แบบฟอร์มรายการเดียว (เฉพาะผู้มีสิทธิ์ forms.manage_templates)
 */

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/permissions';
import { withSubmissionCount } from '@/lib/form-templates';
import { logger } from '@/lib/logger';

/** โยนจากใน $transaction เมื่อพยายามลบ/เปลี่ยน key ของ field ที่มีข้อมูลส่งแล้ว - จับแปลงเป็น 409 ใน catch ด้านนอก */
class FieldInUseError extends Error {
  constructor(public readonly keys: string[]) {
    super(`Field in use: ${keys.join(', ')}`);
  }
}

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

const updateTemplateSchema = z.object({
  menuTitle: z.string().min(1).max(200).optional(),
  documentTitle: z.string().min(1).max(300).optional(),
  isActive: z.boolean().optional(),
  fields: z.array(fieldSchema).min(1).max(50, 'มี field ได้สูงสุด 50 รายการ').optional(),
});

// ไม่มีที่ไหนใน frontend เรียก GET เดี่ยวนี้ (มีแต่ PATCH/DELETE) - ล็อกไว้เฉพาะผู้จัดการแบบฟอร์มไปเลย
// กันไม่ให้พนักงานทั่วไปดู field ของ template ที่ยังไม่ publish ผ่านการเดา id ตรงๆ
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requirePermission(request, PERMISSIONS.FORMS_MANAGE_TEMPLATES);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, error: authResult.error, message: authResult.message },
        { status: authResult.status }
      );
    }

    const { id } = await params;
    const templateId = parseInt(id);
    if (isNaN(templateId)) {
      return NextResponse.json(
        { success: false, error: 'INVALID_ID', message: 'รหัสแบบฟอร์มไม่ถูกต้อง' },
        { status: 400 }
      );
    }

    const template = await prisma.formTemplate.findUnique({
      where: { id: templateId },
      include: {
        fields: { orderBy: { order: 'asc' } },
        _count: { select: { submissions: true } },
      },
    });

    if (!template) {
      return NextResponse.json(
        { success: false, error: 'NOT_FOUND', message: 'ไม่พบแบบฟอร์ม' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: withSubmissionCount(template) });
  } catch (error) {
    logger.error('Get form template error', { error });
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
    const authResult = await requirePermission(request, PERMISSIONS.FORMS_MANAGE_TEMPLATES);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, error: authResult.error, message: authResult.message },
        { status: authResult.status }
      );
    }

    const { id } = await params;
    const templateId = parseInt(id);
    if (isNaN(templateId)) {
      return NextResponse.json(
        { success: false, error: 'INVALID_ID', message: 'รหัสแบบฟอร์มไม่ถูกต้อง' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const result = updateTemplateSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: 'VALIDATION_ERROR', message: 'ข้อมูลไม่ถูกต้อง', details: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const existing = await prisma.formTemplate.findUnique({
      where: { id: templateId },
      include: { fields: true },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'NOT_FOUND', message: 'ไม่พบแบบฟอร์ม' },
        { status: 404 }
      );
    }

    const { fields, ...templateData } = result.data;

    if (fields) {
      const keys = fields.map((f) => f.key);
      if (new Set(keys).size !== keys.length) {
        return NextResponse.json(
          { success: false, error: 'VALIDATION_ERROR', message: 'key ของ field ต้องไม่ซ้ำกัน' },
          { status: 400 }
        );
      }

      // แก้ key/ลบ field ที่มีข้อมูลส่งแล้วไม่ได้ (จะทำ data[key] ของประวัติเก่าอ่านไม่ได้)
      // เช็คภายใน transaction เดียวกับที่ลบ/สร้าง field เพื่อกันไม่ให้ POST /api/form-requests
      // แทรกคำขอใหม่เข้ามาในช่วงระหว่างเช็คจำนวนกับลบ field จริง
      //
      // ลบทั้งหมดแล้วสร้างใหม่ทั้งชุดด้วย createMany (ไม่ upsert ทีละแถว) - ทำได้ปลอดภัยเพราะไม่มี
      // model ไหนอ้างอิง FormTemplateField.id เป็น foreign key (ดู schema.prisma) และช่วยกัน
      // Prisma transaction timeout (default 5s) เมื่อ field เยอะ (สูงสุด 50)
      await prisma.$transaction(async (tx) => {
        const submissionCount = await tx.formRequest.count({ where: { templateId } });
        if (submissionCount > 0) {
          const payloadKeys = new Set(keys);
          const removedKeys = existing.fields.filter((f) => !payloadKeys.has(f.key)).map((f) => f.key);
          if (removedKeys.length > 0) {
            throw new FieldInUseError(removedKeys);
          }
        }

        await tx.formTemplate.update({ where: { id: templateId }, data: templateData });
        await tx.formTemplateField.deleteMany({ where: { templateId } });
        await tx.formTemplateField.createMany({
          data: fields.map((f, i) => ({ ...f, order: f.order ?? i, templateId, options: f.options ?? Prisma.JsonNull })),
        });
      });
    } else if (Object.keys(templateData).length > 0) {
      await prisma.formTemplate.update({ where: { id: templateId }, data: templateData });
    }

    const template = await prisma.formTemplate.findUniqueOrThrow({
      where: { id: templateId },
      include: {
        fields: { orderBy: { order: 'asc' } },
        _count: { select: { submissions: true } },
      },
    });

    return NextResponse.json({
      success: true,
      data: withSubmissionCount(template),
      message: 'อัปเดตแบบฟอร์มสำเร็จ',
    });
  } catch (error) {
    if (error instanceof FieldInUseError) {
      return NextResponse.json(
        {
          success: false,
          error: 'FIELD_IN_USE',
          message: `ไม่สามารถลบ/เปลี่ยน key ของ field ที่มีข้อมูลส่งแล้ว: ${error.keys.join(', ')}`,
        },
        { status: 409 }
      );
    }
    logger.error('Update form template error', { error });
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
    const authResult = await requirePermission(request, PERMISSIONS.FORMS_MANAGE_TEMPLATES);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, error: authResult.error, message: authResult.message },
        { status: authResult.status }
      );
    }

    const { id } = await params;
    const templateId = parseInt(id);
    if (isNaN(templateId)) {
      return NextResponse.json(
        { success: false, error: 'INVALID_ID', message: 'รหัสแบบฟอร์มไม่ถูกต้อง' },
        { status: 400 }
      );
    }

    const existing = await prisma.formTemplate.findUnique({ where: { id: templateId } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'NOT_FOUND', message: 'ไม่พบแบบฟอร์ม' },
        { status: 404 }
      );
    }

    const submissionCount = await prisma.formRequest.count({ where: { templateId } });
    if (submissionCount > 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'FORM_IN_USE',
          message: `แบบฟอร์มนี้มีข้อมูลที่ส่งแล้ว ${submissionCount} รายการ ลบไม่ได้ - กรุณาปิดการใช้งานแทน (isActive: false)`,
        },
        { status: 409 }
      );
    }

    await prisma.formTemplate.delete({ where: { id: templateId } });

    return NextResponse.json({ success: true, message: 'ลบแบบฟอร์มสำเร็จ' });
  } catch (error) {
    logger.error('Delete form template error', { error });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      { status: 500 }
    );
  }
}
