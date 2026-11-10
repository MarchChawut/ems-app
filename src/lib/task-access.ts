/**
 * ==================================================
 * Task Access - สิทธิ์ของบอร์ดงาน "ส่วนรวม" และ "ส่วนตัว"
 * ==================================================
 * - งานส่วนรวม (Task.ownerId = null): ทุกคนที่ล็อกอินเห็นได้ แต่เพิ่ม/แก้ไข/ลบ/ย้ายได้เฉพาะ ADMIN และ SUPER_ADMIN
 * - งานส่วนตัว (Task.ownerId = ผู้ใช้): เห็นและจัดการได้เฉพาะเจ้าของเท่านั้น (ไม่มีใครเห็น แม้แต่แอดมิน)
 * - คอลัมน์ (KanbanColumn) เป็นของส่วนกลาง: จัดการได้เฉพาะ ADMIN และ SUPER_ADMIN
 *
 * ไม่ import Prisma — ใช้ได้ทั้ง server และ unit test
 */

import type { UserRole } from '@/types';

export type TaskScope = 'shared' | 'private';

export function isBoardAdmin(role: UserRole | string): boolean {
  return role === 'ADMIN' || role === 'SUPER_ADMIN';
}

export function parseTaskScope(value: string | null | undefined): TaskScope {
  return value === 'private' ? 'private' : 'shared';
}

/** ผู้ใช้เห็นงานนี้ได้หรือไม่ (งานส่วนตัวของคนอื่น = ไม่เห็น) */
export function canViewTask(user: { id: number }, task: { ownerId: number | null }): boolean {
  return task.ownerId === null || task.ownerId === user.id;
}

/** ผู้ใช้เพิ่ม/แก้ไข/ย้าย/ลบงานนี้ได้หรือไม่ */
export function canMutateTask(user: { id: number; role: UserRole | string }, task: { ownerId: number | null }): boolean {
  if (task.ownerId === null) return isBoardAdmin(user.role);
  return task.ownerId === user.id;
}

/** ผู้ใช้สร้างงานใน scope นี้ได้หรือไม่ */
export function canCreateInScope(user: { role: UserRole | string }, scope: TaskScope): boolean {
  return scope === 'private' ? true : isBoardAdmin(user.role);
}
