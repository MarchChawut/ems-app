/**
 * ==================================================
 * API Route: POST /api/uploads/document
 * ==================================================
 * API สำหรับอัปโหลดเอกสาร PDF หรือรูปภาพ
 * ใช้กับพัสดุและครุภัณฑ์
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { fileTypeFromBuffer } from 'file-type';

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, error: authResult.error, message: authResult.message },
        { status: authResult.status }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'INVALID_INPUT', message: 'กรุณาระบุไฟล์' },
        { status: 400 }
      );
    }

    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

    const bytes = await file.arrayBuffer();
    const buf = Buffer.from(bytes);

    // Detect MIME from magic bytes (not client-provided type)
    const detected = await fileTypeFromBuffer(buf);
    const detectedMime = detected?.mime ?? 'application/octet-stream';
    if (!allowedTypes.includes(detectedMime)) {
      return NextResponse.json(
        { success: false, error: 'INVALID_FILE_TYPE', message: 'รองรับเฉพาะไฟล์ PDF, JPG, PNG, WEBP เท่านั้น' },
        { status: 400 }
      );
    }

    const maxSize = detectedMime === 'application/pdf' ? 10 * 1024 * 1024 : 5 * 1024 * 1024;
    if (file.size > maxSize) {
      const limitLabel = detectedMime === 'application/pdf' ? '10MB' : '5MB';
      return NextResponse.json(
        { success: false, error: 'FILE_TOO_LARGE', message: `ขนาดไฟล์ต้องไม่เกิน ${limitLabel}` },
        { status: 400 }
      );
    }

    const extMap: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
    const ext = extMap[detectedMime] || 'bin';
    const fileName = `doc_${Date.now()}.${ext}`;

    // เก็บ byte ของไฟล์ลงฐานข้อมูลกลาง แทนการเขียนลงดิสก์เครื่อง
    // ทำให้ทุกเครื่องที่ใช้ DB เดียวกันเปิดไฟล์ได้ (ไม่ผูกกับดิสก์เครื่องที่อัปโหลด)
    const record = await prisma.uploadedFile.create({
      data: {
        data: buf,
        mimeType: detectedMime,
        fileName,
        size: file.size,
        uploadedById: authResult.user!.id,
      },
      select: { id: true },
    });

    const url = `/api/files/${record.id}`;

    logger.info('Document uploaded', { fileId: record.id, fileName, size: file.size, userId: authResult.user!.id });

    return NextResponse.json({
      success: true,
      data: { url },
      message: 'อัปโหลดเอกสารสำเร็จ',
    });
  } catch (error) {
    logger.error('Upload document error', { error });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      { status: 500 }
    );
  }
}
