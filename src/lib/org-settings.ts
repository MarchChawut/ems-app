/**
 * ==================================================
 * Org Settings - ข้อมูลหน่วยงานหลัก (ชื่อสังกัด / ชื่อกอง) ที่ใช้ทั่วระบบ
 * ==================================================
 * แก้ที่เดียวจากหน้าตั้งค่าแอดมิน (แถว id = 1 ในตาราง org_settings) แล้วหัวกระดาษ/ผู้รับ/ชื่อผู้อำนวยการของทุกแบบฟอร์ม
 * และค่าเริ่มต้นของพนักงานดึงจากที่นี่ — ไฟล์นี้ import ได้จากทั้ง server, client และ script (seed)
 * (ส่วนที่ต้องใช้ฐานข้อมูลอยู่ใน org-settings-server.ts)
 */

import { z } from 'zod';

export interface OrgInfo {
  /** ชื่อสังกัด เช่น ศูนย์เทคโนโลยีดิจิทัล หน่วยราชการในพระองค์ */
  divisionName: string;
  /** ชื่อกอง (รวมคำว่า "กอง") เช่น กองการศึกษา วิจัย และพัฒนา */
  departmentName: string;
}

/** ค่าเริ่มต้น (ใช้ตอนยังไม่มีแถวในฐานข้อมูล และเป็นค่าตั้งต้นของ migration/seed) */
export const DEFAULT_ORG: OrgInfo = {
  divisionName: 'ศูนย์เทคโนโลยีดิจิทัล หน่วยราชการในพระองค์',
  departmentName: 'กองการศึกษา วิจัย และพัฒนา',
};

export const ORG_DIVISION_MAX = 200;

/** ตัวอักษรควบคุม/ตัวควบคุมทิศทางข้อความ (bidi override) — ชื่อหน่วยงานพิมพ์บนเอกสารราชการทุกใบ จึงห้ามมีเพื่อกันการปลอมแปลงข้อความ */
const UNSAFE_CHARS = /[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]/;
const safeText = (s: string) => !UNSAFE_CHARS.test(s);
export const ORG_DEPARTMENT_MAX = 100;

/** body ของ PATCH /api/org-settings — ส่งเฉพาะที่ต้องการแก้ได้ (อย่างน้อย 1 ค่า) */
export const orgSettingSchema = z
  .object({
    divisionName: z.string().trim().min(1, 'กรุณาระบุชื่อสังกัด').max(ORG_DIVISION_MAX, `ชื่อสังกัดต้องไม่เกิน ${ORG_DIVISION_MAX} ตัวอักษร`).refine(safeText, 'ชื่อสังกัดมีอักขระที่ไม่อนุญาต').optional(),
    departmentName: z.string().trim().min(1, 'กรุณาระบุชื่อกอง').max(ORG_DEPARTMENT_MAX, `ชื่อกองต้องไม่เกิน ${ORG_DEPARTMENT_MAX} ตัวอักษร`).refine(safeText, 'ชื่อกองมีอักขระที่ไม่อนุญาต').optional(),
  })
  .refine((v) => v.divisionName !== undefined || v.departmentName !== undefined, {
    message: 'ไม่มีข้อมูลที่ต้องการแก้ไข',
  });

/** "ผู้อำนวยการกองการศึกษา วิจัย และพัฒนา" — ผู้รับ (เรียน) ในแบบฟอร์ม */
export function directorTitle(org: OrgInfo): string {
  return `ผู้อำนวยการ${org.departmentName}`;
}

/** "ผอ.กองการศึกษา วิจัย และพัฒนา" — ตำแหน่งย่อ (ใช้ในใบลา) */
export function directorShort(org: OrgInfo): string {
  return `ผอ.${org.departmentName}`;
}

/** ค่าของ dropdown กอง/สังกัดในหน้าพนักงาน: ตรงกับหน่วยงานหลัก (หรือว่าง) = 'main', อื่นๆ (ช่วยราชการ) = 'other' */
export function unitSelectionOf(userValue: string | null | undefined, orgValue: string): 'main' | 'other' {
  const v = (userValue ?? '').trim();
  return v === '' || v === orgValue ? 'main' : 'other';
}
