/**
 * ==================================================
 * API Route: /api/users/upload-profile
 * ==================================================
 * API สำหรับอัปโหลดรูปโปรไฟล์พนักงาน
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { canManageTarget } from '@/lib/user-policy';
import { requireAuth, isAdmin } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { fileTypeFromBuffer } from 'file-type';

const ALLOWED_PROFILE_MIME = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * POST /api/users/upload-profile
 * อัปโหลดรูปโปรไฟล์
 * 
 * FormData:
 * - file: ไฟล์รูปภาพ (jpg, png, webp)
 * - userId: ID ของผู้ใช้
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, error: authResult.error, message: authResult.message },
        { status: authResult.status }
      );
    }

    const currentUser = authResult.user!;
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const userId = formData.get('userId') as string | null;

    if (!file || !userId) {
      return NextResponse.json(
        {
          success: false,
          error: 'INVALID_INPUT',
          message: 'กรุณาระบุไฟล์และ ID ผู้ใช้',
        },
        { status: 400 }
      );
    }

    const targetUserId = parseInt(userId);

    // ตรวจสอบสิทธิ์ (เฉพาะ Admin หรือตัวเอง)
    if (!isAdmin(currentUser.role) && currentUser.id !== targetUserId) {
      return NextResponse.json(
        {
          success: false,
          error: 'FORBIDDEN',
          message: 'คุณไม่มีสิทธิ์อัปโหลดรูปโปรไฟล์ของผู้ใช้นี้',
        },
        { status: 403 }
      );
    }

    // ADMIN จัดการรูป/ลายเซ็นของบัญชีระดับ ADMIN/SUPER_ADMIN ไม่ได้ (ลายเซ็นเป็นหลักฐานยืนยันตัวตน — กันการสวมรอย)
    if (currentUser.id !== targetUserId) {
      const targetRole = await prisma.user.findUnique({ where: { id: targetUserId }, select: { role: true } });
      if (targetRole && !canManageTarget(currentUser.role, targetRole.role)) {
        return NextResponse.json(
          { success: false, error: 'FORBIDDEN', message: 'คุณไม่มีสิทธิ์จัดการบัญชีระดับผู้ดูแลระบบ' },
          { status: 403 }
        );
      }
    }

    // ตรวจสอบขนาดก่อนอ่านไฟล์เข้าหน่วยความจำ (สูงสุด 2MB — รูปโปรไฟล์ไม่จำเป็นต้องใหญ่)
    const maxSize = 2 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        {
          success: false,
          error: 'FILE_TOO_LARGE',
          message: 'ขนาดไฟล์ต้องไม่เกิน 2MB',
        },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // ตรวจชนิดไฟล์จาก magic bytes — ห้ามเชื่อ file.type (client ส่งอะไรมาก็ได้) และห้ามใช้นามสกุลจากชื่อไฟล์ของ client
    // (เดิมเขียนลง public/ ด้วยนามสกุลที่ client กำหนด → อัปโหลด .html/.svg เป็น stored XSS ได้)
    const detected = await fileTypeFromBuffer(buffer);
    if (!detected || !ALLOWED_PROFILE_MIME.includes(detected.mime)) {
      return NextResponse.json(
        {
          success: false,
          error: 'INVALID_FILE_TYPE',
          message: 'รองรับเฉพาะไฟล์ JPG, PNG, WEBP เท่านั้น',
        },
        { status: 400 }
      );
    }

    // เก็บ byte ในฐานข้อมูล (ไม่เขียนลง public/ ที่ใครก็เปิดได้โดยไม่ต้องล็อกอิน) แล้วเปิดผ่าน /api/files/<id> ที่ต้องล็อกอิน
    const record = await prisma.uploadedFile.create({
      data: {
        data: buffer,
        mimeType: detected.mime,
        fileName: `profile_${targetUserId}_${Date.now()}.${detected.ext}`,
        size: buffer.length,
        uploadedById: currentUser.id,
      },
      select: { id: true },
    });
    const profileImageUrl = `/api/files/${record.id}`;

    // ลบรูปเดิมของผู้ใช้ (ถ้าเก็บในฐานข้อมูลอยู่แล้ว) กันไฟล์ค้าง
    const previous = await prisma.user.findUnique({ where: { id: targetUserId }, select: { profileImage: true } });
    const previousId = previous?.profileImage?.startsWith('/api/files/')
      ? previous.profileImage.slice('/api/files/'.length)
      : null;

    // อัปเดต profileImage ในฐานข้อมูล
    const user = await prisma.user.update({
      where: { id: targetUserId },
      data: { profileImage: profileImageUrl },
      select: {
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
        avatar: true,
        profileImage: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (previousId) {
      await prisma.uploadedFile.delete({ where: { id: previousId } }).catch(() => undefined);
    }

    return NextResponse.json({
      success: true,
      data: user,
      message: 'อัปโหลดรูปโปรไฟล์สำเร็จ',
    });
  } catch (error) {
    logger.error('Upload profile image error', { error });
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
