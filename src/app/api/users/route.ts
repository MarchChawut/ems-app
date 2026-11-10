/**
 * ==================================================
 * API Route: /api/users
 * ==================================================
 * API สำหรับจัดการข้อมูลผู้ใช้ (CRUD operations)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { canAssignRole } from '@/lib/user-policy';
import { initialSetupFlags } from '@/lib/security-setup';
import { createUserSchema, hashPassword, generateAvatarInitials } from '@/lib/security';
import { requireAuth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { getOrgSettings } from '@/lib/org-settings-server';

/**
 * GET /api/users
 * ดึงรายชื่อผู้ใช้ทั้งหมด
 *
 * Query Parameters:
 * - search: ค้นหาด้วยชื่อหรืออีเมล
 * - role: กรองตามบทบาท
 * - department: กรองตามแผนก
 * - isActive: กรองตามสถานะ
 * - page, limit: แบ่งหน้าแบบ opt-in — ถ้าไม่ส่งมา จะได้ array เต็มเหมือนเดิม
 *   (ผู้เรียกใช้เดิม เช่น dropdown/ตารางต่างๆ ยังพึ่งพา array เต็มอยู่)
 *
 * Response (ไม่ส่ง page/limit):
 * { success: true, data: User[], meta: { total } }
 * Response (ส่ง page และ/หรือ limit):
 * { success: true, data: User[], meta: { total, page, limit, hasMore } }
 */
export async function GET(request: NextRequest) {
  try {
    // ตรวจสอบการเข้าสู่ระบบ
    const authResult = await requireAuth(request);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, error: authResult.error, message: authResult.message },
        { status: authResult.status }
      );
    }

    // ดึง query parameters
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const role = searchParams.get('role');
    const department = searchParams.get('department');
    const isActive = searchParams.get('isActive');

    // แบ่งหน้าแบบ opt-in: ใช้เฉพาะเมื่อมีการส่ง page หรือ limit มาจริง
    const hasPagination = searchParams.has('page') || searchParams.has('limit');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1);
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50') || 50));

    // สร้าง where clause
    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
        { username: { contains: search } },
      ];
    }

    if (role) {
      where.role = role;
    }

    if (department) {
      where.department = department;
    }

    if (isActive !== null) {
      where.isActive = isActive === 'true';
    }

    // EMPLOYEE ไม่ใช่ทำเนียบพนักงาน — ให้เห็นแค่ id/name/avatar/isActive พอสำหรับ dropdown
    // เลือกงาน (Kanban) และแสดงชื่อในรายการลาของตัวเอง ไม่ใช่ข้อมูลติดต่อ/องค์กรของคนอื่น
    const isEmployee = authResult.user!.role === 'EMPLOYEE';
    const select = isEmployee
      ? {
          id: true,
          name: true,
          avatar: true,
          isActive: true,
        }
      : {
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
          mustChangePassword: true, // แอดมินดูว่าบัญชีไหนยังตั้งค่าครั้งแรกไม่เสร็จ
          createdAt: true,
          updatedAt: true,
        };

    // ดึงข้อมูลผู้ใช้ + นับจำนวนผู้ใช้ทั้งหมด (query อิสระต่อกัน รันพร้อมกันได้)
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select,
        orderBy: { createdAt: 'desc' },
        ...(hasPagination ? { skip: (page - 1) * limit, take: limit } : {}),
      }),
      prisma.user.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: users,
      meta: hasPagination ? { total, page, limit, hasMore: page * limit < total } : { total },
    });

  } catch (error) {
    logger.error('Get users error', { error });
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
 * POST /api/users
 * สร้างผู้ใช้ใหม่
 * 
 * Request Body:
 * {
 *   email: string;
 *   username: string;
 *   password: string;
 *   name: string;
 *   role: UserRole;
 *   department?: string;
 * }
 * 
 * Response:
 * {
 *   success: true,
 *   data: User,
 *   message: 'สร้างผู้ใช้สำเร็จ'
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // ตรวจสอบการเข้าสู่ระบบ
    const authResult = await requireAuth(request);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, error: authResult.error, message: authResult.message },
        { status: authResult.status }
      );
    }

    // ตรวจสอบสิทธิ์ (เฉพาะ ADMIN และ SUPER_ADMIN เท่านั้น)
    if (!['ADMIN', 'SUPER_ADMIN'].includes(authResult.user!.role)) {
      return NextResponse.json(
        {
          success: false,
          error: 'FORBIDDEN',
          message: 'คุณไม่มีสิทธิ์สร้างผู้ใช้',
        },
        { status: 403 }
      );
    }

    // อ่านข้อมูลจาก request body
    const body = await request.json();

    // ตรวจสอบข้อมูลด้วย Zod Schema
    const validationResult = createUserSchema.safeParse(body);

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

    const { email, username, password, prefix, name, role, department, supervisorId } = validationResult.data;
    const org = await getOrgSettings();

    // ADMIN สร้างบัญชีระดับ ADMIN/SUPER_ADMIN ไม่ได้ (เฉพาะ SUPER_ADMIN)
    if (!canAssignRole(authResult.user!.role, role)) {
      return NextResponse.json(
        { success: false, error: 'FORBIDDEN', message: 'เฉพาะ Super Admin เท่านั้นที่สร้างบัญชีผู้ดูแลระบบได้' },
        { status: 403 }
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
    }

    // ตรวจสอบว่าอีเมลซ้ำหรือไม่
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

    // ตรวจสอบว่าชื่อผู้ใช้ซ้ำหรือไม่
    const existingUsername = await prisma.user.findUnique({
      where: { username },
    });

    if (existingUsername) {
      return NextResponse.json(
        {
          success: false,
          error: 'USERNAME_EXISTS',
          message: 'ชื่อผู้ใช้นี้ถูกใช้งานแล้ว',
        },
        { status: 409 }
      );
    }

    // เข้ารหัสรหัสผ่าน
    const hashedPassword = await hashPassword(password);

    // สร้าง avatar
    const avatar = generateAvatarInitials(name);

    // สร้างผู้ใช้ใหม่
    const user = await prisma.user.create({
      data: {
        email,
        username,
        password: hashedPassword,
        // รหัสผ่านที่แอดมินตั้งให้เป็นรหัสชั่วคราว: ผู้ใช้ต้องเปลี่ยนเอง + ลงทะเบียน passkey ตอนล็อกอินครั้งแรก (หมดอายุใน 7 วัน)
        ...initialSetupFlags(),
        prefix: prefix || null,
        name,
        role,
        // กอง/สังกัดเริ่มต้น = หน่วยงานหลักจากหน้าตั้งค่า (ผู้ช่วยราชการแก้เป็นหน่วยอื่นได้ภายหลังที่หน้าแก้ไขพนักงาน)
        department: department || org.departmentName,
        division: org.divisionName,
        supervisorId: supervisorId || null,
        avatar,
      },
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

    return NextResponse.json(
      {
        success: true,
        data: user,
        message: 'สร้างผู้ใช้สำเร็จ',
      },
      { status: 201 }
    );

  } catch (error) {
    logger.error('Create user error', { error });
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
