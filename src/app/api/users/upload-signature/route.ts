/**
 * ==================================================
 * API Route: /api/users/upload-signature
 * ==================================================
 * อัปโหลด/ลบรูปลายเซ็นของพนักงาน (เก็บ byte ใน UploadedFile แล้วอ้างอิงผ่าน User.signatureFileId)
 * สิทธิ์: Admin หรือเจ้าของบัญชีเอง
 *
 * POST   FormData: file (png/jpg/webp ≤ 2MB), userId (ไม่ระบุ = ตัวเอง)
 * DELETE ?userId=  (ไม่ระบุ = ตัวเอง)
 */

import { NextRequest, NextResponse } from 'next/server';
import { fileTypeFromBuffer } from 'file-type';
import { prisma } from '@/lib/prisma';
import { canManageTarget } from '@/lib/user-policy';
import { requireAuth, isAdmin } from '@/lib/auth';
import { logger } from '@/lib/logger';

const MAX_SIGNATURE_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp'];

const INTERNAL_ERROR = {
  success: false,
  error: 'INTERNAL_ERROR',
  message: 'เกิดข้อผิดพลาดภายในระบบ',
};

/** ลบไฟล์ลายเซ็นเดิม (ถ้ามี) โดยไม่ให้ error ทำให้ flow หลักล้ม */
async function deleteOldSignature(fileId: string | null | undefined) {
  if (!fileId) return;
  await prisma.uploadedFile.delete({ where: { id: fileId } }).catch(() => undefined);
}

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
    const userIdRaw = formData.get('userId') as string | null;
    const targetUserId = userIdRaw ? parseInt(userIdRaw) : currentUser.id;

    if (!file || !Number.isInteger(targetUserId)) {
      return NextResponse.json(
        { success: false, error: 'INVALID_INPUT', message: 'กรุณาระบุไฟล์ลายเซ็น' },
        { status: 400 }
      );
    }

    if (!isAdmin(currentUser.role) && currentUser.id !== targetUserId) {
      return NextResponse.json(
        { success: false, error: 'FORBIDDEN', message: 'คุณไม่มีสิทธิ์จัดการลายเซ็นของผู้ใช้นี้' },
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

    if (file.size > MAX_SIGNATURE_SIZE) {
      return NextResponse.json(
        { success: false, error: 'FILE_TOO_LARGE', message: 'ขนาดไฟล์ต้องไม่เกิน 2MB' },
        { status: 400 }
      );
    }

    const buf = Buffer.from(await file.arrayBuffer());

    // ตรวจชนิดไฟล์จาก magic bytes (ไม่เชื่อ type ที่ client ส่งมา)
    const detected = await fileTypeFromBuffer(buf);
    if (!detected || !ALLOWED_MIME.includes(detected.mime)) {
      return NextResponse.json(
        { success: false, error: 'INVALID_FILE_TYPE', message: 'รองรับเฉพาะไฟล์ PNG, JPG, WEBP เท่านั้น' },
        { status: 400 }
      );
    }

    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, signatureFileId: true },
    });
    if (!target) {
      return NextResponse.json(
        { success: false, error: 'USER_NOT_FOUND', message: 'ไม่พบผู้ใช้' },
        { status: 404 }
      );
    }

    const record = await prisma.uploadedFile.create({
      data: {
        data: buf,
        mimeType: detected.mime,
        fileName: `signature_${targetUserId}_${Date.now()}.${detected.ext}`,
        size: buf.length,
        uploadedById: currentUser.id,
      },
      select: { id: true },
    });

    await prisma.user.update({
      where: { id: targetUserId },
      data: { signatureFileId: record.id },
    });
    await deleteOldSignature(target.signatureFileId);

    logger.info('Signature uploaded', { userId: targetUserId, by: currentUser.id, fileId: record.id });

    return NextResponse.json({
      success: true,
      data: { signatureFileId: record.id },
      message: 'อัปโหลดลายเซ็นสำเร็จ',
    });
  } catch (error) {
    logger.error('Upload signature error', { error });
    return NextResponse.json(INTERNAL_ERROR, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, error: authResult.error, message: authResult.message },
        { status: authResult.status }
      );
    }
    const currentUser = authResult.user!;

    const userIdRaw = request.nextUrl.searchParams.get('userId');
    const targetUserId = userIdRaw ? parseInt(userIdRaw) : currentUser.id;

    if (!Number.isInteger(targetUserId)) {
      return NextResponse.json(
        { success: false, error: 'INVALID_INPUT', message: 'รหัสผู้ใช้ไม่ถูกต้อง' },
        { status: 400 }
      );
    }

    if (!isAdmin(currentUser.role) && currentUser.id !== targetUserId) {
      return NextResponse.json(
        { success: false, error: 'FORBIDDEN', message: 'คุณไม่มีสิทธิ์จัดการลายเซ็นของผู้ใช้นี้' },
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

    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { signatureFileId: true },
    });
    if (!target) {
      return NextResponse.json(
        { success: false, error: 'USER_NOT_FOUND', message: 'ไม่พบผู้ใช้' },
        { status: 404 }
      );
    }

    await prisma.user.update({ where: { id: targetUserId }, data: { signatureFileId: null } });
    await deleteOldSignature(target.signatureFileId);

    return NextResponse.json({ success: true, message: 'ลบลายเซ็นสำเร็จ' });
  } catch (error) {
    logger.error('Delete signature error', { error });
    return NextResponse.json(INTERNAL_ERROR, { status: 500 });
  }
}
