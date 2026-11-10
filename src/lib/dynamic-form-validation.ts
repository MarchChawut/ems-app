/**
 * ==================================================
 * Dynamic Form Validation - สร้าง Zod schema แบบ runtime จาก FormTemplate
 * ==================================================
 * ใช้แทน createFormRequestSchema (discriminated union แบบ static) เดิมที่รู้ field
 * ล่วงหน้าไม่ได้ เพราะ template มาจากฐานข้อมูล (admin สร้างเองผ่าน form builder)
 */

import { z } from 'zod';

export interface TemplateFieldLike {
  key: string;
  inputType: string;
  required: boolean;
  /** ตัวเลือกที่อนุญาต — ใช้เมื่อ inputType = "select" หรือ "checkbox"  (string[] เก็บเป็น Json ใน DB) */
  options?: unknown;
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^\d{2}:\d{2}(:\d{2})?$/;

export const formRequestEnvelopeSchema = z.object({
  templateId: z.number().int().positive(),
  requestDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'กรุณาระบุวันที่ให้ถูกต้อง'),
  documentNumber: z.string().max(100).nullable().optional(),
});

/** ดึง options ของ field แบบ select ให้เป็น string[] ที่ปลอดภัย (options เก็บเป็น Json ใน DB) */
function selectOptions(field: TemplateFieldLike): [string, ...string[]] | null {
  if (!Array.isArray(field.options)) return null;
  const values = field.options.filter((v): v is string => typeof v === 'string');
  return values.length > 0 ? (values as [string, ...string[]]) : null;
}

/** สร้าง Zod schema สำหรับ field เดียว ตาม inputType (ไม่รวม required/optional) */
function baseFieldSchema(field: TemplateFieldLike): z.ZodTypeAny {
  switch (field.inputType) {
    case 'number':
      return z.number();
    case 'select': {
      const options = selectOptions(field);
      // template ที่สร้างไม่ถูกต้อง (ไม่มี options) ไม่ควรทำให้ field รับค่าอะไรก็ได้แบบไม่จำกัด
      return options ? z.enum(options) : z.string().max(2000);
    }
    case 'checkbox': {
      // เลือกได้หลายค่า เก็บเป็น string[] — ค่าต้องอยู่ใน options เท่านั้น
      const options = selectOptions(field);
      return options ? z.array(z.enum(options)).max(options.length) : z.array(z.string().max(200)).max(50);
    }
    case 'user':
      return z.number().int().positive();
    case 'tel':
      return z.string().max(30).regex(/^[0-9+\-()\s]*$/, `กรุณาระบุ ${field.key} เป็นเบอร์โทรที่ถูกต้อง`);
    case 'date':
      return z.string().regex(DATE_REGEX, `กรุณาระบุ ${field.key} เป็นวันที่ที่ถูกต้อง`);
    case 'time':
      return z.string().regex(TIME_REGEX, `กรุณาระบุ ${field.key} เป็นเวลาที่ถูกต้อง`);
    default:
      return z.string().max(2000);
  }
}

/** สร้าง Zod schema สำหรับ `data` ตาม field ของ template ที่โหลดมาจาก DB */
export function buildTemplateDataSchema(fields: TemplateFieldLike[]) {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const field of fields) {
    let fieldSchema = baseFieldSchema(field);

    if (field.required) {
      if (fieldSchema instanceof z.ZodString) {
        fieldSchema = fieldSchema.min(1, `กรุณาระบุ ${field.key}`);
      } else if (fieldSchema instanceof z.ZodArray) {
        fieldSchema = fieldSchema.min(1, `กรุณาเลือก ${field.key} อย่างน้อย 1 รายการ`);
      }
    } else {
      fieldSchema = fieldSchema.nullable().optional();
    }

    shape[field.key] = fieldSchema;
  }

  return z.object(shape);
}
