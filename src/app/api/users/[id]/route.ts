/**
 * ==================================================
 * API Route: /api/users/[id]
 * ==================================================
 * API สำหรับจัดการผู้ใช้เดี่ยว (ดู, อัปเดต, ลบ)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { canAssignRole, canManageTarget } from '@/lib/user-policy';
import { requireAuth, isAdmin } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { z } from 'zod';

// Schema สำหรับอัปเดตผู้ใช้
const updateUserSchema = z.object({
  email: z.union([z.string().email('รูปแบบอีเมลไม่ถูกต้อง'), z.literal('')]).nullable().optional(),
  prefix: z.string().max(50).nullable().optional(),
  name: z.string().min(1, 'กรุณาระบุชื่อ').max(100).optional(),
  role: z.enum(['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'DIRECTOR', 'EMPLOYEE', 'HR']).optional(),
  department: z.string().max(100).nullable().optional(),
  division: z.string().max(200).nullable().optional(),
  section: z.string().max(100).nullable().optional(),
  position: z.string().max(100).nullable().optional(),
  positionSecond: z.string().max(100).nullable().optional(),
  positionLevel: z.number().int().min(1).max(11).nullable().optional(),
  phone: z.string().max(20).nullable().optional(),
  birthday: z.string().nullable().optional(), // YYYY-MM-DD
  address: z.string().max(500).nullable().optional(),
  profileImage: z.string().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
  supervisorId: z.number().int().positive().nullable().optional(),
  // การเปลี่ยนรหัสผ่านไม่ผ่านช่องทางนี้แล้ว - ใช้ /api/auth/change-password (ผู้ใช้เปลี่ยนเอง)
  // หรือ /api/users/[id]/reset-password (super admin รีเซ็ตให้ผู้อื่น) แทน
});

/**
 * GET /api/users/[id]
 * ดึงข้อมูลผู้ใช้ตาม ID
 * 
 * Response:
 * {
 *   success: true,
 *   data: User
 * }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // ตรวจสอบการเข้าสู่ระบบ
    const authResult = await requireAuth(request);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, error: authResult.error, message: authResult.message },
        { status: authResult.status }
      );
    }

    const currentUser = authResult.user!;
    const { id } = await params;
    const userId = parseInt(id);

    if (isNaN(userId)) {
      return NextResponse.json(
        {
          success: false,
          error: 'INVALID_ID',
          message: 'รหัสผู้ใช้ไม่ถูกต้อง',
        },
        { status: 400 }
      );
    }

    // EMPLOYEE ดูข้อมูลตัวเองได้ แต่ดูของคนอื่นไม่ได้ (ไม่ใช่ทำเนียบพนักงาน)
    if (currentUser.role === 'EMPLOYEE' && currentUser.id !== userId) {
      return NextResponse.json(
        { success: false, error: 'FORBIDDEN', message: 'คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้' },
        { status: 403 }
      );
    }

    // ดึงข้อมูลผู้ใช้
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        prefix: true,
        name: true,
        role: true,
        department: true,
        section: true,
        division: true,
        position: true,
        positionSecond: true,
        positionLevel: true,
        phone: true,
        birthday: true,
        address: true,
        avatar: true,
        profileImage: true,
        isActive: true,
        supervisorId: true,
        signatureFileId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: 'USER_NOT_FOUND',
          message: 'ไม่พบผู้ใช้',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: user,
    });

  } catch (error) {
    logger.error('Get user error', { error });
    return NextResponse.json(
      {
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'เกิดข้อผิดพลาดภายในระบบ',
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/users/[id]
 * อัปเดตข้อมูลผู้ใช้
 * 
 * Request Body:
 * {
 *   email?: string;
 *   name?: string;
 *   role?: UserRole;
 *   department?: string;
 *   isActive?: boolean;
 *   password?: string;
 * }
 * 
 * Response:
 * {
 *   success: true,
 *   data: User,
 *   message: 'อัปเดตผู้ใช้สำเร็จ'
 * }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // ตรวจสอบการเข้าสู่ระบบ
    const authResult = await requireAuth(request);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, error: authResult.error, message: authResult.message },
        { status: authResult.status }
      );
    }

    const currentUser = authResult.user!;
    const { id } = await params;
    const userId = parseInt(id);

    if (isNaN(userId)) {
      return NextResponse.json(
        {
          success: false,
          error: 'INVALID_ID',
          message: 'รหัสผู้ใช้ไม่ถูกต้อง',
        },
        { status: 400 }
      );
    }

    // ตรวจสอบสิทธิ์ (เฉพาะ ADMIN หรือตัวเองเท่านั้น)
    if (!isAdmin(currentUser.role) && currentUser.id !== userId) {
      return NextResponse.json(
        {
          success: false,
          error: 'FORBIDDEN',
          message: 'คุณไม่มีสิทธิ์แก้ไขผู้ใช้นี้',
        },
        { status: 403 }
      );
    }

    // ตรวจสอบว่าผู้ใช้มีอยู่หรือไม่
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!existingUser) {
      return NextResponse.json(
        {
          success: false,
          error: 'USER_NOT_FOUND',
          message: 'ไม่พบผู้ใช้',
        },
        { status: 404 }
      );
    }

    // อ่านข้อมูลจาก request body
    const body = await request.json();

    // ตรวจสอบข้อมูลด้วย Zod Schema
    const validationResult = updateUserSchema.safeParse(body);

    if (!validationResult.success) {
      const errors = validationResult.error.flatten().fieldErrors;
      return NextResponse.json(
        {
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'ข้อมูลไม่ถูกต้อง',
          details: errors,
        },
        { status: 400 }
      );
    }

    const { email, name, role, department, isActive, supervisorId } = validationResult.data;

    // ป้องกันการยกระดับสิทธิ์ (privilege escalation):
    // - แก้ไข/ปิดใช้งานบัญชีของคนอื่น: ADMIN จัดการได้เฉพาะบัญชีที่ไม่ใช่ ADMIN/SUPER_ADMIN (ที่เหลือเป็นของ SUPER_ADMIN)
    // - กำหนด role: ADMIN/SUPER_ADMIN ให้ได้เฉพาะ SUPER_ADMIN
    // - ห้ามเปลี่ยน role ของตัวเอง (ADMIN เคยตั้งตัวเองเป็น SUPER_ADMIN ได้)
    if (currentUser.id !== userId && !canManageTarget(currentUser.role, existingUser.role)) {
      return NextResponse.json(
        { success: false, error: 'FORBIDDEN', message: 'คุณไม่มีสิทธิ์แก้ไขบัญชีระดับผู้ดูแลระบบ' },
        { status: 403 }
      );
    }
    if (role !== undefined && role !== existingUser.role) {
      if (currentUser.id === userId) {
        return NextResponse.json(
          { success: false, error: 'CANNOT_CHANGE_OWN_ROLE', message: 'ไม่สามารถเปลี่ยนบทบาทของตัวเองได้' },
          { status: 403 }
        );
      }
      if (!canAssignRole(currentUser.role, role)) {
        return NextResponse.json(
          { success: false, error: 'FORBIDDEN', message: 'เฉพาะ Super Admin เท่านั้นที่กำหนดบทบาทผู้ดูแลระบบได้' },
          { status: 403 }
        );
      }
    }

    // ไม่สามารถระงับการใช้งานบัญชีตัวเองได้ (ป้องกันล็อกตัวเองออกจากระบบ)
    // ตรวจเฉพาะกรณีที่ isActive จะถูกนำไปใช้จริง (เฉพาะ ADMIN เท่านั้นที่เปลี่ยน isActive ได้)
    if (isAdmin(currentUser.role) && currentUser.id === userId && isActive === false) {
      return NextResponse.json(
        {
          success: false,
          error: 'CANNOT_DEACTIVATE_SELF',
          message: 'ไม่สามารถระงับการใช้งานบัญชีตัวเองได้',
        },
        { status: 400 }
      );
    }

    // ไม่สามารถตั้งตัวเองเป็นหัวหน้างานของตัวเองได้
    if (supervisorId !== undefined && supervisorId !== null && supervisorId === userId) {
      return NextResponse.json(
        {
          success: false,
          error: 'CANNOT_SUPERVISE_SELF',
          message: 'ไม่สามารถตั้งตัวเองเป็นหัวหน้างานของตัวเองได้',
        },
        { status: 400 }
      );
    }

    // ตรวจสอบว่าหัวหน้างานที่ระบุมีอยู่จริงหรือไม่
    if (supervisorId) {
      const supervisorExists = await prisma.user.findUnique({ where: { id: supervisorId } });
      if (!supervisorExists) {
        return NextResponse.json(
          { success: false, error: 'SUPERVISOR_NOT_FOUND', message: 'ไม่พบหัวหน้างานที่ระบุ' },
          { status: 400 }
        );
      }

      // ตรวจสอบวงจร (cycle) ในสายบังคับบัญชา - ไล่ขึ้นจาก supervisor ที่จะตั้งใหม่
      // ถ้าเจอ userId ระหว่างทาง แปลว่าการตั้งค่านี้จะสร้างวงวนไม่รู้จบ (A -> B -> C -> A)
      // ซึ่งจะทำให้โค้ดที่ไล่สาย supervisorId แบบเรียกซ้ำ (เช่น chain การอนุมัติลา) วนไม่จบ
      let cursorId: number | null = supervisorExists.supervisorId;
      const visited = new Set<number>([supervisorId]);
      let hops = 0;
      const MAX_SUPERVISOR_CHAIN_HOPS = 50;
      while (cursorId !== null && hops < MAX_SUPERVISOR_CHAIN_HOPS) {
        if (cursorId === userId) {
          return NextResponse.json(
            {
              success: false,
              error: 'SUPERVISOR_CYCLE',
              message: 'ไม่สามารถตั้งหัวหน้างานนี้ได้ เนื่องจากจะทำให้สายบังคับบัญชาวนกลับมาที่ผู้ใช้นี้',
            },
            { status: 400 }
          );
        }
        if (visited.has(cursorId)) break; // มีวงจรอยู่แล้วในข้อมูลเดิม ไม่เกี่ยวกับ userId ของ request นี้
        visited.add(cursorId);
        const next: { supervisorId: number | null } | null = await prisma.user.findUnique({
          where: { id: cursorId },
          select: { supervisorId: true },
        });
        cursorId = next?.supervisorId ?? null;
        hops++;
      }
    }

    // ตรวจสอบว่าอีเมลซ้ำหรือไม่ (ถ้ามีการเปลี่ยนอีเมล)
    if (email && email !== existingUser.email) {
      const existingEmail = await prisma.user.findUnique({
        where: { email },
      });

      if (existingEmail) {
        return NextResponse.json(
          {
            success: false,
            error: 'EMAIL_EXISTS',
            message: 'อีเมลนี้ถูกใช้งานแล้ว',
          },
          { status: 409 }
        );
      }
    }

    // สร้างข้อมูลสำหรับอัปเดต
    const updateData: any = {};

    if (email !== undefined) {
      updateData.email = email || null;
    }

    if (name !== undefined) {
      updateData.name = name;
    }

    // เฉพาะ ADMIN เท่านั้นที่สามารถเปลี่ยน role และ isActive
    if (isAdmin(currentUser.role)) {
      if (role !== undefined) {
        updateData.role = role;
      }

      if (isActive !== undefined) {
        updateData.isActive = isActive;
      }
    }

    if (validationResult.data.prefix !== undefined) {
      updateData.prefix = validationResult.data.prefix || null;
    }

    // เฉพาะ ADMIN เท่านั้นที่สามารถเปลี่ยนข้อมูลองค์กร
    if (isAdmin(currentUser.role)) {
      if (department !== undefined) {
        updateData.department = department || null;
      }
      if (validationResult.data.section !== undefined) {
        updateData.section = validationResult.data.section?.trim() || null;
      }
      if (validationResult.data.division !== undefined) {
        updateData.division = validationResult.data.division || null;
      }
      if (validationResult.data.position !== undefined) {
        updateData.position = validationResult.data.position || null;
      }
      if (validationResult.data.positionSecond !== undefined) {
        updateData.positionSecond = validationResult.data.positionSecond || null;
      }
      if (validationResult.data.positionLevel !== undefined) {
        updateData.positionLevel = validationResult.data.positionLevel;
      }
      if (supervisorId !== undefined) {
        updateData.supervisorId = supervisorId;
      }
    }

    if (validationResult.data.phone !== undefined) {
      updateData.phone = validationResult.data.phone || null;
    }

    if (validationResult.data.birthday !== undefined) {
      updateData.birthday = validationResult.data.birthday ? new Date(validationResult.data.birthday) : null;
    }

    if (validationResult.data.address !== undefined) {
      updateData.address = validationResult.data.address || null;
    }

    if (validationResult.data.profileImage !== undefined) {
      updateData.profileImage = validationResult.data.profileImage;
    }

    // อัปเดตผู้ใช้
    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        username: true,
        prefix: true,
        name: true,
        role: true,
        department: true,
        section: true,
        division: true,
        position: true,
        positionSecond: true,
        positionLevel: true,
        phone: true,
        birthday: true,
        address: true,
        avatar: true,
        profileImage: true,
        isActive: true,
        supervisorId: true,
        signatureFileId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: user,
      message: 'อัปเดตผู้ใช้สำเร็จ',
    });

  } catch (error) {
    logger.error('Update user error', { error });
    return NextResponse.json(
      {
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'เกิดข้อผิดพลาดภายในระบบ',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/users/[id]
 * ลบผู้ใช้
 * 
 * Response:
 * {
 *   success: true,
 *   message: 'ลบผู้ใช้สำเร็จ'
 * }
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // ตรวจสอบการเข้าสู่ระบบ
    const authResult = await requireAuth(request);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, error: authResult.error, message: authResult.message },
        { status: authResult.status }
      );
    }

    const currentUser = authResult.user!;
    const { id } = await params;
    const userId = parseInt(id);

    if (isNaN(userId)) {
      return NextResponse.json(
        {
          success: false,
          error: 'INVALID_ID',
          message: 'รหัสผู้ใช้ไม่ถูกต้อง',
        },
        { status: 400 }
      );
    }

    // ตรวจสอบสิทธิ์ (เฉพาะ ADMIN เท่านั้น)
    if (!isAdmin(currentUser.role)) {
      return NextResponse.json(
        {
          success: false,
          error: 'FORBIDDEN',
          message: 'คุณไม่มีสิทธิ์ลบผู้ใช้',
        },
        { status: 403 }
      );
    }

    // ไม่สามารถลบตัวเองได้
    if (currentUser.id === userId) {
      return NextResponse.json(
        {
          success: false,
          error: 'CANNOT_DELETE_SELF',
          message: 'ไม่สามารถลบบัญชีตัวเองได้',
        },
        { status: 400 }
      );
    }

    // ตรวจสอบว่าผู้ใช้มีอยู่หรือไม่
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!existingUser) {
      return NextResponse.json(
        {
          success: false,
          error: 'USER_NOT_FOUND',
          message: 'ไม่พบผู้ใช้',
        },
        { status: 404 }
      );
    }

    // ADMIN ลบได้เฉพาะบัญชีที่ไม่ใช่ ADMIN/SUPER_ADMIN
    if (!canManageTarget(currentUser.role, existingUser.role)) {
      return NextResponse.json(
        { success: false, error: 'FORBIDDEN', message: 'คุณไม่มีสิทธิ์ลบบัญชีระดับผู้ดูแลระบบ' },
        { status: 403 }
      );
    }

    // ลบผู้ใช้ (Prisma จะลบข้อมูลที่เกี่ยวข้องอัตโนมัติตาม onDelete: Cascade)
    await prisma.user.delete({
      where: { id: userId },
    });

    // ลบไฟล์ลายเซ็นของผู้ใช้ที่ถูกลบ (UploadedFile ไม่มี FK กับ User จึงไม่ถูก cascade) — ไม่ให้ error ทำให้การลบล้ม
    if (existingUser.signatureFileId) {
      await prisma.uploadedFile
        .delete({ where: { id: existingUser.signatureFileId } })
        .catch((error) => logger.warn('Failed to delete signature file of deleted user', { userId, error }));
    }

    return NextResponse.json({
      success: true,
      message: 'ลบผู้ใช้สำเร็จ',
    });

  } catch (error) {
    logger.error('Delete user error', { error });
    return NextResponse.json(
      {
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'เกิดข้อผิดพลาดภายในระบบ',
      },
      { status: 500 }
    );
  }
}
