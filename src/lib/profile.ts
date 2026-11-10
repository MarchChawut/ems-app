/**
 * ==================================================
 * Profile Helper
 * ==================================================
 * ใช้ร่วมกันโดย GET /api/users/me และหน้า /dashboard/profile (Server Component)
 * เพื่อไม่ให้ select ข้อมูลผู้ใช้ซ้ำกันสองที่
 */

import { prisma } from './prisma';

const PROFILE_SELECT = {
  id: true,
  email: true,
  username: true,
  prefix: true,
  name: true,
  role: true,
  department: true,
  division: true,
  position: true,
  positionSecond: true,
  positionLevel: true,
  phone: true,
  birthday: true,
  address: true,
  avatar: true,
  profileImage: true,
  signatureFileId: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

export function getFullProfile(userId: number) {
  return prisma.user.findUnique({ where: { id: userId }, select: PROFILE_SELECT });
}
