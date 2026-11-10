/**
 * ==================================================
 * Form Request List Helper
 * ==================================================
 * ใช้ร่วมกันโดย GET /api/form-requests และหน้า /dashboard/forms (Server Component)
 * เพื่อไม่ให้ query + role-scoping logic ซ้ำกันสองที่
 */

import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { isManagerOrAbove } from './auth';
import type { UserRole, FormRequest } from '@/types';
import { buildRequesterSnapshot, validateVehicleCounts, VEHICLE_APPROVER_ROLES, VEHICLE_PERSON_FIELDS } from './vehicle-request';

export const FORM_REQUEST_INCLUDE = {
  requestedBy: { select: { id: true, prefix: true, name: true, position: true, department: true, division: true, avatar: true, signatureFileId: true } },
  template: { include: { fields: { orderBy: { order: 'asc' as const } } } },
} as const;

export interface ListFormRequestsParams {
  /** ถ้าใส่มา ใช้แทน page*limit เสมอ - จำเป็นสำหรับ "โหลดเพิ่ม" ฝั่ง client ที่คำนวณจากจำนวนแถวที่มีอยู่จริง
   * (ไม่ใช่จาก page เดิม) กันรายการซ้ำ/หายเมื่อมีการเพิ่มข้อมูลใหม่ระหว่างที่ผู้ใช้กำลังเลื่อนดูประวัติอยู่ */
  skip?: number;
  page?: number;
  limit?: number;
  userId?: number;
  type?: string;
}

export async function listFormRequests(
  currentUser: { id: number; role: UserRole },
  params: ListFormRequestsParams = {}
) {
  const limit = Math.min(200, Math.max(1, params.limit ?? 50));
  const page = Math.max(1, params.page ?? 1);
  const skip = params.skip !== undefined ? Math.max(0, params.skip) : (page - 1) * limit;

  const where: Prisma.FormRequestWhereInput = {};

  // ถ้าไม่ใช่ manager ขึ้นไป ให้เห็นเฉพาะรายการของตัวเอง (เหมือนใบลา)
  if (!isManagerOrAbove(currentUser.role)) {
    where.requestedById = currentUser.id;
  } else if (params.userId) {
    where.requestedById = params.userId;
  }

  if (params.type) {
    where.type = params.type as Prisma.FormRequestWhereInput['type'];
  }

  const [formRequests, total] = await Promise.all([
    prisma.formRequest.findMany({
      where,
      include: FORM_REQUEST_INCLUDE,
      orderBy: [{ createdAt: 'desc' }],
      skip,
      take: limit,
    }),
    prisma.formRequest.count({ where }),
  ]);

  return {
    // Prisma อนุมาน `data` เป็น JsonValue กว้างๆ และ template.fields.options เป็น JsonValue เช่นกัน
    // (ดูเหตุผลเดียวกับ form-templates.ts) - ค่าจริงถูกจำกัดด้วย Zod ตอนเขียนเสมอ
    formRequests: formRequests as unknown as FormRequest[],
    // page คำนวณจาก skip เสมอ (ไม่ใช่แค่ param page ที่ส่งเข้ามา) ให้ตรงกับตำแหน่งจริงไม่ว่าจะเรียกด้วย
    // page หรือ skip - คง field นี้ไว้เพื่อ backward-compat กับผู้เรียกเดิมที่อ่าน meta.page (เช่น test เดิม)
    meta: { total, page: Math.floor(skip / limit) + 1, limit, hasMore: skip + formRequests.length < total },
  };
}

// ============================================
// ตัวเลือกชื่อ "ข้าพเจ้า" ของใบขอรถยนต์
// ============================================

/** รายชื่อ ผบ.ชา.: ไม่ส่งเบอร์โทร (ไม่จำเป็นต่อการเติมใบ) */
export const APPROVER_OPTION_SELECT = {
  id: true,
  prefix: true,
  name: true,
  position: true,
  positionSecond: true,
  positionLevel: true,
  department: true,
  section: true,
  division: true,
} as const;

/** รายชื่อผู้ขอ: เพิ่มเบอร์โทรไว้เติมช่อง "เบอร์โทรผู้ขอใช้รถ" อัตโนมัติ */
export const REQUESTER_OPTION_SELECT = { ...APPROVER_OPTION_SELECT, phone: true } as const;

/**
 * รายชื่อที่เลือกเป็น "ข้าพเจ้า" ได้: ADMIN/SUPER_ADMIN เห็นผู้ใช้ที่ active ทุกคน, คนอื่นเห็นเฉพาะตัวเอง
 * ส่งเฉพาะฟิลด์ที่ใช้เติมใบ (ไม่ขยาย /api/users/options เพื่อไม่ให้ EMPLOYEE เห็นข้อมูลคนอื่นเพิ่ม)
 */
export async function listRequesterOptions(currentUser: { id: number; role: UserRole }) {
  const admin = currentUser.role === 'ADMIN' || currentUser.role === 'SUPER_ADMIN';
  return prisma.user.findMany({
    where: admin ? { isActive: true } : { id: currentUser.id },
    select: REQUESTER_OPTION_SELECT,
    orderBy: { name: 'asc' },
  });
}

/** รายชื่อ ผบ.ชา. ที่เลือกได้ (role MANAGER/DIRECTOR ที่ active) — ทุกคนที่ใช้ฟอร์มนี้เห็นชุดเดียวกัน */
export async function listApproverOptions() {
  return prisma.user.findMany({
    where: { isActive: true, role: { in: [...VEHICLE_APPROVER_ROLES] } },
    select: APPROVER_OPTION_SELECT,
    orderBy: { name: 'asc' },
  });
}

/**
 * รายชื่อผู้ประสานงาน/ผู้จัดทำ (คนในกอง = ผู้ใช้ active ทุกคน)
 * เบอร์โทรส่งให้เฉพาะ ADMIN/SUPER_ADMIN (ข้อมูลส่วนบุคคล) — ผู้ใช้อื่นเห็นแค่ชื่อ แล้ว server เติมเบอร์ให้ตอนบันทึก
 * (ดู resolveVehicleRequester) จึงไม่ต้องส่งเบอร์ของทุกคนไปที่เบราว์เซอร์ของพนักงานทั่วไป
 */
export async function listCoordinatorOptions(currentUser: { role: UserRole }) {
  const admin = currentUser.role === 'ADMIN' || currentUser.role === 'SUPER_ADMIN';
  return prisma.user.findMany({
    where: { isActive: true },
    select: admin ? { id: true, prefix: true, name: true, phone: true } : { id: true, prefix: true, name: true },
    orderBy: { name: 'asc' },
  });
}

/**
 * ตรวจ/เติมข้อมูลผู้ขอของใบขอรถยนต์ก่อนบันทึก (ใช้ใน POST และ PATCH)
 * - ผู้ที่ไม่ใช่ admin เลือกได้เฉพาะตัวเอง → ไม่ผ่านคืน 403
 * - ไม่พบผู้ใช้/ถูกปิดใช้งาน → 400
 * - ผ่าน: คืน data ที่ `requesterName` ถูกเขียนทับจากฐานข้อมูล (กันปลอมชื่อ)
 */
export async function resolveVehicleRequester(
  currentUser: { id: number; role: UserRole },
  data: Record<string, unknown>
): Promise<
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; status: 400 | 403; error: string; message: string }
> {
  const targetId = Number(data.requesterUserId);
  const admin = currentUser.role === 'ADMIN' || currentUser.role === 'SUPER_ADMIN';
  if (!Number.isInteger(targetId) || targetId <= 0) {
    return { ok: false, status: 400, error: 'VALIDATION_ERROR', message: 'กรุณาเลือกชื่อผู้ขอใช้รถ' };
  }
  if (!admin && targetId !== currentUser.id) {
    return { ok: false, status: 403, error: 'FORBIDDEN', message: 'เลือกได้เฉพาะชื่อของตัวเอง' };
  }
  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { ...REQUESTER_OPTION_SELECT, isActive: true },
  });
  if (!target || !target.isActive) {
    return { ok: false, status: 400, error: 'VALIDATION_ERROR', message: 'ไม่พบผู้ใช้ที่เลือก' };
  }
  const result: Record<string, unknown> = { ...data, requesterName: buildRequesterSnapshot(target).name };
  // เบอร์ผู้ขอ: เติมจากโปรไฟล์ของผู้ขอถ้าไม่ได้กรอก
  if (result.phone === null || result.phone === undefined || result.phone === '') {
    result.phone = target.phone?.trim() || null;
  }

  // ผบ.ชา. (ไม่บังคับ): ต้องเป็น MANAGER/DIRECTOR ที่ active; เขียนชื่อทับจาก DB; ไม่เลือก = ล้างชื่อ
  const approverId = data.approverUserId === null || data.approverUserId === undefined ? null : Number(data.approverUserId);
  if (approverId === null) {
    result.approverUserId = null;
    result.approverName = null;
  } else {
    const approver = await prisma.user.findUnique({
      where: { id: approverId },
      select: { ...APPROVER_OPTION_SELECT, isActive: true, role: true },
    });
    if (!approver || !approver.isActive || !(VEHICLE_APPROVER_ROLES as readonly string[]).includes(approver.role)) {
      return { ok: false, status: 400, error: 'VALIDATION_ERROR', message: 'ผบ.ชา. ที่เลือกไม่ถูกต้อง' };
    }
    result.approverName = buildRequesterSnapshot(approver).name;
  }

  // ผู้ประสานงาน / ผู้จัดทำเอกสาร (ไม่บังคับ): เลือกจากรายชื่อ → ต้องเป็นผู้ใช้ active และเขียนชื่อทับจาก DB;
  // ไม่เลือก (อื่นๆ/ว่าง) → ใช้ชื่อที่กรอกเองตามเดิม
  for (const [idKey, { nameKey, phoneKey }] of Object.entries(VEHICLE_PERSON_FIELDS)) {
    const raw = data[idKey];
    const personId = raw === null || raw === undefined ? null : Number(raw);
    if (personId === null) {
      result[idKey] = null;
      continue;
    }
    const person = await prisma.user.findUnique({
      where: { id: personId },
      select: { id: true, prefix: true, name: true, phone: true, isActive: true },
    });
    if (!person || !person.isActive) {
      return { ok: false, status: 400, error: 'VALIDATION_ERROR', message: 'รายชื่อที่เลือกไม่ถูกต้อง' };
    }
    result[nameKey] = buildRequesterSnapshot(person).name;
    // เบอร์: ถ้าผู้ใช้ไม่ได้กรอกเอง (หรือไม่ได้เห็นเบอร์ในรายการ) ให้เติมจากโปรไฟล์ของคนที่เลือก
    if (result[phoneKey] === null || result[phoneKey] === undefined || result[phoneKey] === '') {
      result[phoneKey] = person.phone?.trim() || null;
    }
  }

  const countError = validateVehicleCounts(data);
  if (countError) {
    return { ok: false, status: 400, error: 'VALIDATION_ERROR', message: countError };
  }
  return { ok: true, data: result };
}
