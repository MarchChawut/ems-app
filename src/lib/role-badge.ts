import type { UserRole } from '@/types';

/** สี/ป้ายกำกับสำหรับแสดงบทบาทผู้ใช้แต่ละแบบ ใช้ร่วมกันทุกหน้าที่แสดงรายชื่อผู้ใช้ */
export const roleConfig: Record<UserRole, { label: string; bg: string; text: string }> = {
  SUPER_ADMIN: { label: 'Super Admin', bg: 'bg-purple-100', text: 'text-purple-700' },
  ADMIN: { label: 'Admin', bg: 'bg-indigo-100', text: 'text-indigo-700' },
  MANAGER: { label: 'Manager', bg: 'bg-blue-100', text: 'text-blue-700' },
  DIRECTOR: { label: 'Director', bg: 'bg-amber-100', text: 'text-amber-700' },
  HR: { label: 'HR', bg: 'bg-pink-100', text: 'text-pink-700' },
  EMPLOYEE: { label: 'Employee', bg: 'bg-slate-100', text: 'text-slate-700' },
};
