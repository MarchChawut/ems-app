/**
 * ==================================================
 * Permissions - รายการสิทธิ์การใช้งานที่ admin กำหนดให้ผู้ใช้แต่ละคนได้ (granular, นอกเหนือจาก Role)
 * ==================================================
 * permission key เป็นค่าคงที่ในโค้ด ไม่ใช่สิ่งที่ admin สร้างเองได้แบบอิสระ
 * เพราะ permission ที่ไม่มีจุดเช็คในโค้ดจริงคือของประดับ ไม่มีประโยชน์
 *
 * isAdmin/isManagerOrAbove เดิมใน src/lib/auth.ts ยังใช้งานอยู่เหมือนเดิมกับ route ทั้งหมด
 * hasPermission() ที่นี่เป็นชั้นเสริม ไม่ใช่ตัวแทนที่มาลบของเดิม
 */

import type { UserRole } from '@/types';

// จงใจไม่ import จาก './auth' — auth.ts พึ่งพา next/headers ซึ่งใช้ได้เฉพาะใน Next.js runtime
// ไฟล์นี้ต้อง import ได้จาก script ธรรมดา (เช่น prisma/seed.ts ที่รันผ่าน tsx) ด้วย
function isAdminRole(role: UserRole): boolean {
  return role === 'ADMIN' || role === 'SUPER_ADMIN';
}

export const PERMISSIONS = {
  LEAVES_APPROVE: 'leaves.approve',
  EMPLOYEES_MANAGE: 'employees.manage',
  SUPPLIES_MANAGE: 'supplies.manage',
  ASSETS_MANAGE: 'assets.manage',
  DOCUMENTS_MANAGE: 'documents.manage',
  FORMS_MANAGE_TEMPLATES: 'forms.manage_templates',
  FORMS_APPROVE: 'forms.approve',
  FORMS_REQUEST_VEHICLE: 'forms.request_vehicle',
  ORG_MANAGE: 'org.manage',
  PERMISSIONS_MANAGE: 'permissions.manage',
  TASKS_MANAGE_FOLDERS: 'tasks.manage_folders',
  ROSTER_MANAGE: 'roster.manage',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSION_KEYS: PermissionKey[] = Object.values(PERMISSIONS);

/**
 * ตรวจสอบว่าผู้ใช้มีสิทธิ์ตาม permission key ที่ระบุหรือไม่
 * admin/super admin ผ่านเสมอ (short-circuit) เพื่อการันตีว่า admin ไม่มีวันถูกบล็อกโดยระบบ permission ใหม่นี้
 */
export function hasPermission(
  user: { role: UserRole; permissions: string[] },
  key: PermissionKey
): boolean {
  return isAdminRole(user.role) || user.permissions.includes(key);
}

/**
 * ผู้ใช้กรอก/ส่งแบบฟอร์มตาม template นี้ได้หรือไม่
 * ใบขอรับการสนับสนุนรถยนต์ (VEHICLE_REQUEST) ต้องมีสิทธิ์ forms.request_vehicle (แอดมินกำหนดได้ที่หน้าตั้งค่าสิทธิ์);
 * แบบฟอร์มอื่นเปิดให้ทุกคนเหมือนเดิม
 */
export function canUseFormTemplate(
  user: { role: UserRole; permissions: string[] },
  systemKey: string | null | undefined
): boolean {
  if (systemKey === 'VEHICLE_REQUEST') return hasPermission(user, PERMISSIONS.FORMS_REQUEST_VEHICLE);
  return true;
}
