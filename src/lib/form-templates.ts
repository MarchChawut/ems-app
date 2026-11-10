/**
 * ==================================================
 * Form Template Helpers
 * ==================================================
 * ใช้ร่วมกันโดย GET /api/form-templates และหน้าที่โหลดข้อมูลฝั่ง server
 * (forms/page.tsx, settings/form-builder/page.tsx) เพื่อไม่ให้ query ซ้ำกันสองที่
 */

import { prisma } from './prisma';
import type { FormTemplateConfig } from '@/types';
import { getOrgSettings } from './org-settings-server';
import { applyOrgToVehicleFields } from './vehicle-request';

const TEMPLATE_INCLUDE = {
  fields: { orderBy: { order: 'asc' as const } },
  _count: { select: { submissions: true } },
} as const;

/** แปลง `_count.submissions` (จาก Prisma `include: { _count: { select: { submissions: true } } }`) เป็น `submissionCount` แบบแบน */
export function withSubmissionCount<T extends { _count: { submissions: number } }>(
  template: T
): Omit<T, '_count'> & { submissionCount: number } {
  const { _count, ...rest } = template;
  return { ...rest, submissionCount: _count.submissions };
}

// Prisma อนุมาน `systemKey`/`inputType`/`options` เป็น string/JsonValue กว้างๆ (คอลัมน์จริงคือ VARCHAR/JSON
// ไม่ใช่ enum/array ที่ type-safe ในระดับ DB) แต่ค่าจริงถูกจำกัดด้วย Zod ตอนเขียนเสมอ (ดู createTemplateSchema,
// updateTemplateSchema) จึง cast ให้ตรงกับ FormTemplateConfig ที่ประกาศไว้ฝั่ง app ได้อย่างปลอดภัย

/** แบบฟอร์มที่เปิดใช้งานอยู่ - พนักงานเลือกกรอกได้ (ดู requireAuth ที่ผู้เรียกใช้) */
export async function listActiveFormTemplates(): Promise<FormTemplateConfig[]> {
  const templates = await prisma.formTemplate.findMany({
    where: { isActive: true },
    include: TEMPLATE_INCLUDE,
    orderBy: [{ order: 'asc' }, { id: 'asc' }],
  });
  const org = await getOrgSettings();
  // ตัวเลือก "ส่วนราชการ" ของใบขอรถยนต์ใช้ชื่อสังกัดปัจจุบัน (ดู applyOrgToVehicleFields)
  return templates.map((t) => applyOrgToVehicleFields(withSubmissionCount(t), org)) as unknown as FormTemplateConfig[];
}

/** แบบฟอร์มทั้งหมด รวม draft/inactive - เฉพาะผู้จัดการแบบฟอร์ม (ดู requirePermission ที่ผู้เรียกใช้) */
export async function listAllFormTemplates(): Promise<FormTemplateConfig[]> {
  const templates = await prisma.formTemplate.findMany({
    include: TEMPLATE_INCLUDE,
    orderBy: [{ order: 'asc' }, { id: 'asc' }],
  });
  return templates.map(withSubmissionCount) as unknown as FormTemplateConfig[];
}
