/**
 * ==================================================
 * API Route: /api/leaves/[id]
 * ==================================================
 * API สำหรับจัดการรายการลาเดี่ยว (อัปเดตสถานะ, ลบ)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createLeaveSchema } from '@/lib/security';
import { requireAuth, isManagerOrAbove, isAdmin } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { toSafeGregorianDate } from '@/lib/utils';
import { calculateLeaveDays } from '@/lib/leave-calc';
import { getEffectiveLeaveRule } from '@/lib/leave-rules-server';
import { notifyLeaveStage } from '@/lib/leave-notifications';
import { getFeatureSettings } from '@/lib/feature-settings-server';
import { disabledLeaveTypeMessage } from '@/lib/leave-type-options';

/**
 * PUT /api/leaves/[id]
 * แก้ไขรายละเอียดการลา
 *
 * Request Body:
 * {
 *   type?: LeaveType;
 *   startDate?: string;
 *   endDate?: string;
 *   reason?: string;
 *   isHalfDay?: boolean;
 *   hours?: number;
 * }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth(request);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, error: authResult.error, message: authResult.message },
        { status: authResult.status }
      );
    }

    const currentUser = authResult.user!;
    const { id } = await params;
    const leaveId = parseInt(id);

    if (isNaN(leaveId)) {
      return NextResponse.json(
        { success: false, error: 'INVALID_ID', message: 'รหัสการลาไม่ถูกต้อง' },
        { status: 400 }
      );
    }

    const existingLeave = await prisma.leave.findUnique({
      where: { id: leaveId },
    });

    if (!existingLeave) {
      return NextResponse.json(
        { success: false, error: 'LEAVE_NOT_FOUND', message: 'ไม่พบรายการลา' },
        { status: 404 }
      );
    }

    // ตรวจสอบสิทธิ์ (เจ้าของรายการหรือ MANAGER ขึ้นไป)
    if (existingLeave.userId !== currentUser.id && !isManagerOrAbove(currentUser.role)) {
      return NextResponse.json(
        { success: false, error: 'FORBIDDEN', message: 'คุณไม่มีสิทธิ์แก้ไขรายการลานี้' },
        { status: 403 }
      );
    }

    // แก้ไขได้เฉพาะก่อนเริ่มกระบวนการตรวจสอบ/อนุมัติเท่านั้น (สถานะ PENDING)
    // ป้องกันการแก้ไขข้อมูลหลังธุรการ/หัวหน้างานตรวจสอบไปแล้ว ซึ่งจะทำให้การตรวจสอบไร้ความหมาย
    if (existingLeave.status !== 'PENDING') {
      return NextResponse.json(
        {
          success: false,
          error: 'LEAVE_ALREADY_IN_REVIEW',
          message: 'ไม่สามารถแก้ไขได้ เนื่องจากมีการตรวจสอบ/อนุมัติไปแล้ว',
        },
        { status: 400 }
      );
    }

    const body = await request.json();

    // Validate ข้อมูล
    const validationResult = createLeaveSchema.safeParse(body);
    if (!validationResult.success) {
      const errors = validationResult.error.flatten().fieldErrors;
      return NextResponse.json(
        { success: false, error: 'VALIDATION_ERROR', message: 'ข้อมูลไม่ถูกต้อง', details: errors },
        { status: 400 }
      );
    }

    const { type, startDate, endDate, reason, isHalfDay, hours, outTime, backTime, formCategory, contactAddress } = validationResult.data;

    // เปลี่ยนประเภทเป็นมาสาย/ออกก่อนเวลาที่แอดมินปิดไว้ไม่ได้ (กันหลบการปิดฟีเจอร์ผ่านการแก้ไขใบลาเดิม)
    {
      const disabledMessage = disabledLeaveTypeMessage(type, await getFeatureSettings());
      if (disabledMessage) {
        return NextResponse.json({ success: false, error: 'FEATURE_DISABLED', message: disabledMessage }, { status: 403 });
      }
    }

    // คำนวณจำนวนวันลา (ใช้กฎการลาที่มีผลกับปีงบประมาณของ startDate)
    const start = toSafeGregorianDate(startDate);
    const end = toSafeGregorianDate(endDate);

    let holidays: { date: Date }[] = [];
    try {
      const holidayRecords = await prisma.holiday.findMany({
        where: { isActive: true, date: { gte: start, lte: end } },
        select: { date: true },
      });
      holidays = holidayRecords;
    } catch {}

    const leaveRule = await getEffectiveLeaveRule(start);
    const totalDays = calculateLeaveDays(start, end, isHalfDay ?? false, hours, holidays, leaveRule);

    const leave = await prisma.leave.update({
      where: { id: leaveId },
      data: {
        type,
        startDate: toSafeGregorianDate(startDate),
        endDate: toSafeGregorianDate(endDate),
        reason,
        isHalfDay: isHalfDay || false,
        hours: hours || null,
        outTime: outTime || null,
        backTime: backTime || null,
        formCategory: formCategory || null,
        totalDays,
        contactAddress: contactAddress || null,
      },
      include: {
        user: {
          select: {
            id: true,
            prefix: true,
            name: true,
            avatar: true,
            department: true,
            division: true,
            position: true,
            phone: true,
            address: true,
            supervisorId: true,
            signatureFileId: true,
            role: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: leave,
      message: 'แก้ไขรายการลาสำเร็จ',
    });

  } catch (error) {
    logger.error('Update leave details error', { error });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/leaves/[id]
 * อัปเดตสถานะการลา (อนุมัติ/ไม่อนุมัติ) - แบบ 3 ขั้นตอนตามลำดับขั้น
 * แต่ละขั้นทำได้เฉพาะบุคคลที่ถูกต้องเท่านั้น ไม่มีสิทธิ์ override ข้ามขั้น และห้าม
 * ยื่นลาเอง-อนุมัติเอง (self-approval) ยกเว้น break-glass กรณีเดียว (ดูขั้นที่ 3)
 *
 * ขั้นที่ 1 (สถานะ PENDING): เฉพาะ ADMIN/SUPER_ADMIN (ธุรการ) เท่านั้น
 *   - อนุมัติ -> สถานะเปลี่ยนเป็น ADMIN_REVIEWED (adminReviewedBy/At) ยังไม่จบ รอหัวหน้างาน
 *   - ไม่อนุมัติ -> สถานะเปลี่ยนเป็น REJECTED ทันที (จบ ไม่ส่งต่อ)
 * ขั้นที่ 2 (สถานะ ADMIN_REVIEWED): เฉพาะหัวหน้างานที่ถูกกำหนดไว้ (User.supervisorId ตรงกับผู้ดำเนินการ)
 *   - ถ้าเจ้าของใบลายังไม่ได้ถูกกำหนดหัวหน้างาน (supervisorId เป็น null) จะดำเนินการขั้นนี้ไม่ได้ (ไม่มี fallback)
 *   - อนุมัติ -> สถานะเปลี่ยนเป็น SUPERVISOR_APPROVED (supervisorApprovedBy/At) รอ ผอ.กอง
 *   - ไม่อนุมัติ -> REJECTED
 * ขั้นที่ 3 (สถานะ SUPERVISOR_APPROVED): เฉพาะ role DIRECTOR (ผอ.กอง) เท่านั้น
 *   - อนุมัติ/ไม่อนุมัติ -> สถานะสุดท้าย APPROVED/REJECTED
 *   - break-glass: ถ้าเจ้าของใบลาเป็น DIRECTOR เอง (ยื่นลาเอง ทำให้ตัวเองอนุมัติขั้นนี้ไม่ได้เพราะโดนบล็อก
 *     self-approval) อนุญาตให้ SUPER_ADMIN อนุมัติแทนได้เฉพาะกรณีนี้ พร้อม log คำเตือน
 *
 * ทุกขั้นใช้ optimistic concurrency guard (update เฉพาะเมื่อ status ตรงกับที่อ่านมา) ป้องกัน
 * การอนุมัติซ้ำจากสอง request พร้อมกัน และส่งแจ้งเตือนเข้ากลุ่ม LINE เมื่อเปลี่ยนสถานะสำเร็จเท่านั้น
 *
 * Request Body:
 * {
 *   status: 'APPROVED' | 'REJECTED';
 * }
 *
 * Response:
 * {
 *   success: true,
 *   data: Leave,
 *   message: 'อัปเดตสถานะการลาสำเร็จ'
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
    const leaveId = parseInt(id);

    if (isNaN(leaveId)) {
      return NextResponse.json(
        {
          success: false,
          error: 'INVALID_ID',
          message: 'รหัสการลาไม่ถูกต้อง',
        },
        { status: 400 }
      );
    }

    // ตรวจสอบว่าการลามีอยู่หรือไม่ (พร้อมข้อมูลหัวหน้างานและ role ของเจ้าของใบลา เพื่อตรวจสิทธิ์ตามลำดับขั้น)
    const existingLeave = await prisma.leave.findUnique({
      where: { id: leaveId },
      include: { user: { select: { id: true, name: true, supervisorId: true, role: true } } },
    });

    if (!existingLeave) {
      return NextResponse.json(
        {
          success: false,
          error: 'LEAVE_NOT_FOUND',
          message: 'ไม่พบรายการลา',
        },
        { status: 404 }
      );
    }

    // อ่านข้อมูลจาก request body
    const body = await request.json();

    // ตรวจสอบสถานะ
    const validStatuses = ['APPROVED', 'REJECTED'];
    if (!validStatuses.includes(body.status)) {
      return NextResponse.json(
        {
          success: false,
          error: 'INVALID_STATUS',
          message: 'สถานะไม่ถูกต้อง',
        },
        { status: 400 }
      );
    }

    // ห้ามยื่นลาเอง-อนุมัติเอง ในทุกขั้นตอน
    const isSelfLeave = existingLeave.userId === currentUser.id;

    type UpdateData = {
      status: 'APPROVED' | 'REJECTED' | 'ADMIN_REVIEWED' | 'SUPERVISOR_APPROVED';
      adminReviewedBy?: number;
      adminReviewedAt?: Date;
      supervisorApprovedBy?: number;
      supervisorApprovedAt?: Date;
      approvedBy?: number;
      approvedAt?: Date;
    };
    let updateData: UpdateData;
    let message: string;
    let notifyEvent: Parameters<typeof notifyLeaveStage>[0];
    let breakGlass = false;

    if (existingLeave.status === 'PENDING') {
      // ขั้นที่ 1: เฉพาะ ADMIN/SUPER_ADMIN (ธุรการ) เท่านั้น
      const canActAsAdmin = isAdmin(currentUser.role) && !isSelfLeave;

      if (!canActAsAdmin) {
        return NextResponse.json(
          { success: false, error: 'FORBIDDEN', message: 'คุณไม่มีสิทธิ์ตรวจสอบการลานี้ (ต้องเป็นธุรการ และไม่ใช่ผู้ยื่นเอง)' },
          { status: 403 }
        );
      }

      if (body.status === 'REJECTED') {
        updateData = { status: 'REJECTED', approvedBy: currentUser.id, approvedAt: new Date() };
        message = 'ปฏิเสธการลาสำเร็จ';
        notifyEvent = { kind: 'ADMIN_REVIEWED', leave: existingLeave, approved: false };
      } else {
        updateData = { status: 'ADMIN_REVIEWED', adminReviewedBy: currentUser.id, adminReviewedAt: new Date() };
        message = 'ธุรการตรวจสอบแล้ว รอหัวหน้างานเซ็นอนุมัติ';
        notifyEvent = { kind: 'ADMIN_REVIEWED', leave: existingLeave, approved: true };
      }
    } else if (existingLeave.status === 'ADMIN_REVIEWED') {
      // ขั้นที่ 2: เฉพาะหัวหน้างานที่ถูกกำหนดไว้เท่านั้น (ไม่มี fallback)
      if (existingLeave.user.supervisorId === null) {
        return NextResponse.json(
          {
            success: false,
            error: 'SUPERVISOR_NOT_ASSIGNED',
            message: 'พนักงานคนนี้ยังไม่ได้กำหนดหัวหน้างาน กรุณากำหนดหัวหน้างานก่อนจึงจะดำเนินการขั้นนี้ได้',
          },
          { status: 400 }
        );
      }

      const canActAsSupervisor = existingLeave.user.supervisorId === currentUser.id && !isSelfLeave;

      if (!canActAsSupervisor) {
        return NextResponse.json(
          { success: false, error: 'FORBIDDEN', message: 'คุณไม่มีสิทธิ์อนุมัติการลานี้ (ไม่ใช่หัวหน้างานของพนักงานคนนี้)' },
          { status: 403 }
        );
      }

      if (body.status === 'REJECTED') {
        updateData = { status: 'REJECTED', approvedBy: currentUser.id, approvedAt: new Date() };
        message = 'ปฏิเสธการลาสำเร็จ';
        notifyEvent = { kind: 'SUPERVISOR_APPROVED', leave: existingLeave, approved: false };
      } else {
        updateData = { status: 'SUPERVISOR_APPROVED', supervisorApprovedBy: currentUser.id, supervisorApprovedAt: new Date() };
        message = 'หัวหน้างานอนุมัติแล้ว รอ ผอ.กองพิจารณาต่อไป';
        notifyEvent = { kind: 'SUPERVISOR_APPROVED', leave: existingLeave, approved: true };
      }
    } else if (existingLeave.status === 'SUPERVISOR_APPROVED') {
      // ขั้นที่ 3: เฉพาะ role DIRECTOR (ผอ.กอง) เท่านั้น
      // break-glass: ถ้าเจ้าของใบลาเป็น DIRECTOR เอง (ยื่นลาเอง) เจ้าตัวจะโดนบล็อก self-approval
      // จนไม่มีใครอนุมัติขั้นนี้ได้เลย จึงอนุญาตให้ SUPER_ADMIN คนอื่น (ไม่ใช่เจ้าของใบลา) อนุมัติแทนได้เฉพาะกรณีนี้
      const normalCanAct = currentUser.role === 'DIRECTOR' && !isSelfLeave;
      const canUseBreakGlass =
        !isSelfLeave && existingLeave.user.role === 'DIRECTOR' && currentUser.role === 'SUPER_ADMIN';
      const canActAsDirector = normalCanAct || canUseBreakGlass;

      if (!canActAsDirector) {
        return NextResponse.json(
          { success: false, error: 'FORBIDDEN', message: 'คุณไม่มีสิทธิ์อนุมัติขั้นตอนนี้ (ต้องเป็น ผอ.กอง)' },
          { status: 403 }
        );
      }

      if (canUseBreakGlass) {
        breakGlass = true;
        logger.warn('Leave director-stage break-glass used', {
          leaveId,
          superAdminId: currentUser.id,
          directorId: existingLeave.userId,
        });
      }

      updateData = { status: body.status, approvedBy: currentUser.id, approvedAt: new Date() };
      message = body.status === 'APPROVED' ? 'อนุมัติการลาสำเร็จ' : 'ปฏิเสธการลาสำเร็จ';
      notifyEvent = {
        kind: 'DIRECTOR_DECIDED',
        leave: existingLeave,
        approved: body.status === 'APPROVED',
        breakGlass,
      };
    } else {
      // APPROVED หรือ REJECTED ไปแล้ว
      return NextResponse.json(
        {
          success: false,
          error: 'ALREADY_PROCESSED',
          message: 'รายการลานี้ได้รับการพิจารณาแล้ว',
        },
        { status: 400 }
      );
    }

    // อัปเดตสถานะการลาแบบ optimistic concurrency (update เฉพาะเมื่อ status ยังตรงกับที่อ่านมา)
    // ป้องกันสอง request พร้อมกันอนุมัติซ้ำ/เปลี่ยนสถานะซ้อนกัน
    const updateResult = await prisma.leave.updateMany({
      where: { id: leaveId, status: existingLeave.status },
      data: updateData,
    });

    if (updateResult.count === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'CONFLICT',
          message: 'สถานะรายการนี้ถูกเปลี่ยนไปแล้วโดยผู้อื่น กรุณารีเฟรชหน้าจอ',
        },
        { status: 409 }
      );
    }

    const leave = await prisma.leave.findUniqueOrThrow({
      where: { id: leaveId },
      include: {
        user: {
          select: {
            id: true,
            prefix: true,
            name: true,
            avatar: true,
            department: true,
            division: true,
            position: true,
            phone: true,
            address: true,
            supervisorId: true,
            signatureFileId: true,
            role: true,
          },
        },
      },
    });

    notifyEvent.leave = leave;
    // ไม่ await - แจ้งเตือน LINE ไม่ควรทำให้การอนุมัติ/ตอบกลับ API ช้าลงเพราะรอ fetch ภายนอก
    void notifyLeaveStage(notifyEvent).catch((error) => {
      logger.error('notifyLeaveStage failed', { error });
    });

    return NextResponse.json({
      success: true,
      data: leave,
      message,
    });

  } catch (error) {
    logger.error('Update leave error', { error });
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
 * DELETE /api/leaves/[id]
 * ลบรายการลา
 * 
 * Response:
 * {
 *   success: true,
 *   message: 'ลบรายการลาสำเร็จ'
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
    const leaveId = parseInt(id);

    if (isNaN(leaveId)) {
      return NextResponse.json(
        {
          success: false,
          error: 'INVALID_ID',
          message: 'รหัสการลาไม่ถูกต้อง',
        },
        { status: 400 }
      );
    }

    // ตรวจสอบว่าการลามีอยู่หรือไม่
    const existingLeave = await prisma.leave.findUnique({
      where: { id: leaveId },
    });

    if (!existingLeave) {
      return NextResponse.json(
        {
          success: false,
          error: 'LEAVE_NOT_FOUND',
          message: 'ไม่พบรายการลา',
        },
        { status: 404 }
      );
    }

    // ตรวจสอบสิทธิ์ (เจ้าของรายการหรือ MANAGER ขึ้นไปเท่านั้น)
    if (existingLeave.userId !== currentUser.id && !isManagerOrAbove(currentUser.role)) {
      return NextResponse.json(
        {
          success: false,
          error: 'FORBIDDEN',
          message: 'คุณไม่มีสิทธิ์ลบรายการลานี้',
        },
        { status: 403 }
      );
    }

    // เจ้าของรายการลบได้เฉพาะก่อนเริ่มกระบวนการตรวจสอบเท่านั้น (กันลบทิ้งเพื่อซ่อนประวัติหลังถูกตรวจสอบ/ปฏิเสธ)
    // MANAGER ขึ้นไปยังคงลบได้ทุกสถานะ (ไว้ใช้ทำความสะอาดข้อมูลผิดพลาด)
    if (
      existingLeave.userId === currentUser.id &&
      !isManagerOrAbove(currentUser.role) &&
      existingLeave.status !== 'PENDING'
    ) {
      return NextResponse.json(
        {
          success: false,
          error: 'LEAVE_ALREADY_IN_REVIEW',
          message: 'ไม่สามารถลบได้ เนื่องจากมีการตรวจสอบ/อนุมัติไปแล้ว',
        },
        { status: 400 }
      );
    }

    // ลบรายการลา
    await prisma.leave.delete({
      where: { id: leaveId },
    });

    return NextResponse.json({
      success: true,
      message: 'ลบรายการลาสำเร็จ',
    });

  } catch (error) {
    logger.error('Delete leave error', { error });
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
