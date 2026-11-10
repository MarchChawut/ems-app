/**
 * ==================================================
 * API Route: GET /api/files/[id]
 * ==================================================
 * เสิร์ฟไฟล์ (รูปภาพ/เอกสาร) ที่เก็บไว้เป็น byte ในฐานข้อมูล
 * ใช้คู่กับ POST /api/uploads/document
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isManagerOrAbove } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

export async function GET(
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

    const { id } = await params;

    // ไฟล์ลายเซ็นของพนักงานเป็นข้อมูลอ่อนไหว (ใช้ปลอมแปลงเอกสารได้) — ไม่ใช่ทุกคนที่ล็อกอินเปิดดูได้
    // อนุญาตเฉพาะ: เจ้าของ, MANAGER ขึ้นไป, ฝ่ายบุคคล (HR), และหัวหน้างานโดยตรงของเจ้าของ
    // (ผู้ที่ต้องเปิด/พิมพ์ใบลาของเจ้าของ) ส่วนไฟล์อื่น (เอกสารพัสดุ/ครุภัณฑ์) ยังเปิดได้ทุกคนที่ล็อกอินเหมือนเดิม
    const signatureOwner = await prisma.user.findFirst({
      where: { signatureFileId: id },
      select: { id: true, supervisorId: true },
    });
    if (signatureOwner) {
      const me = authResult.user!;
      const allowed =
        me.id === signatureOwner.id ||
        isManagerOrAbove(me.role) ||
        me.role === 'HR' ||
        signatureOwner.supervisorId === me.id;
      if (!allowed) {
        return NextResponse.json(
          { success: false, error: 'FORBIDDEN', message: 'คุณไม่มีสิทธิ์เปิดไฟล์นี้' },
          { status: 403 }
        );
      }
    }

    const file = await prisma.uploadedFile.findUnique({
      where: { id },
      select: { data: true, mimeType: true, fileName: true, size: true },
    });

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'NOT_FOUND', message: 'ไม่พบไฟล์' },
        { status: 404 }
      );
    }

    const body = new Uint8Array(file.data);

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': file.mimeType,
        'Content-Length': String(file.size),
        'Content-Disposition': `inline; filename="${encodeURIComponent(file.fileName)}"`,
        // เนื้อหาผูกกับ id ที่ไม่ซ้ำและไม่เปลี่ยน จึง cache ได้ยาว
        'Cache-Control': 'private, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    logger.error('Serve file error', { error });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      { status: 500 }
    );
  }
}
