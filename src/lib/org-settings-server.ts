/**
 * Org Settings (ฝั่ง server) - อ่าน/แก้ข้อมูลหน่วยงานหลักจากฐานข้อมูล
 * แยกจาก org-settings.ts เพราะไฟล์นั้นต้อง import ได้จาก client/script โดยไม่ลาก prisma เข้าไปด้วย
 */

import { prisma } from './prisma';
import { DEFAULT_ORG, type OrgInfo } from './org-settings';

export const ORG_SETTING_ID = 1;

/** ค่าหน่วยงานหลักปัจจุบัน (ไม่มีแถว → ค่าเริ่มต้น) */
export async function getOrgSettings(): Promise<OrgInfo> {
  const row = await prisma.orgSetting.findUnique({ where: { id: ORG_SETTING_ID } });
  return row ? { divisionName: row.divisionName, departmentName: row.departmentName } : { ...DEFAULT_ORG };
}
