/**
 * ==================================================
 * User Policy - ใครจัดการบัญชีของใครได้ (กัน privilege escalation)
 * ==================================================
 * ADMIN เป็นผู้จัดการผู้ใช้ทั่วไป แต่ห้ามยกระดับสิทธิ์ตัวเอง/ผู้อื่นเป็น ADMIN/SUPER_ADMIN หรือไปแก้/ปิด/ลบ/รีเซ็ตรหัสผ่าน
 * บัญชีระดับ ADMIN ขึ้นไป — เรื่องเหล่านี้เป็นของ SUPER_ADMIN เท่านั้น
 * (เดิม ADMIN ตั้ง role ใครเป็น SUPER_ADMIN ได้ รวมถึงตัวเอง = ยกระดับสิทธิ์เป็นสูงสุดได้ทันที)
 *
 * ไม่ import Prisma/โค้ดฝั่ง server — ใช้ได้ทั้ง server และ unit test
 */

import type { UserRole } from '@/types';

const PRIVILEGED_ROLES: UserRole[] = ['ADMIN', 'SUPER_ADMIN'];

export function isPrivilegedRole(role: UserRole | string): boolean {
  return (PRIVILEGED_ROLES as string[]).includes(role);
}

/** ผู้กระทำ (actor) กำหนด role นี้ให้ผู้ใช้ได้หรือไม่ (สร้างผู้ใช้ใหม่/เปลี่ยน role/นำเข้า) */
export function canAssignRole(actorRole: UserRole, role: UserRole | string): boolean {
  if (isPrivilegedRole(role)) return actorRole === 'SUPER_ADMIN';
  return isPrivilegedRole(actorRole);
}

/** ผู้กระทำแก้ไข/ปิดใช้งาน/ลบ/รีเซ็ตรหัสผ่านของบัญชีเป้าหมาย (ที่ไม่ใช่ตัวเอง) ได้หรือไม่ */
export function canManageTarget(actorRole: UserRole, targetRole: UserRole | string): boolean {
  if (actorRole === 'SUPER_ADMIN') return true;
  if (actorRole === 'ADMIN') return !isPrivilegedRole(targetRole);
  return false;
}
