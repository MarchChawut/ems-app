/**
 * ==================================================
 * API Route: /api/documents/[id]
 * ==================================================
 * GET / PATCH / DELETE เอกสารรับ-ส่งเดี่ยว
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createDocumentRegisterSchema } from '@/lib/security';
import { requireAuth, isAdmin } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { toSafeGregorianDate } from '@/lib/utils';

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

    if (authResult.user!.role === 'EMPLOYEE') {
      return NextResponse.json(
        { success: false, error: 'FORBIDDEN', message: 'คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const document = await prisma.documentRegister.findUnique({
      where: { id: parseInt(id) },
      include: {
        recordedBy: { select: { id: true, prefix: true, name: true, avatar: true } },
      },
    });

    if (!document) {
      return NextResponse.json(
        { success: false, error: 'NOT_FOUND', message: 'ไม่พบเอกสาร' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: document });
  } catch (error) {
    logger.error('Get document error', { error });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      { status: 500 }
    );
  }
}

export async function PATCH(
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

    if (!isAdmin(authResult.user!.role)) {
      return NextResponse.json(
        { success: false, error: 'FORBIDDEN', message: 'คุณไม่มีสิทธิ์จัดการทะเบียนรับ-ส่งเอกสาร' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const result = createDocumentRegisterSchema.partial().safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: 'VALIDATION_ERROR', message: 'ข้อมูลไม่ถูกต้อง', details: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const data = {
      ...result.data,
      ...(result.data.date !== undefined && { date: toSafeGregorianDate(result.data.date) }),
    };

    const document = await prisma.documentRegister.update({
      where: { id: parseInt(id) },
      data,
      include: {
        recordedBy: { select: { id: true, prefix: true, name: true, avatar: true } },
      },
    });

    return NextResponse.json({
      success: true,
      data: document,
      message: 'อัปเดตเอกสารสำเร็จ',
    });
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return NextResponse.json(
        { success: false, error: 'NOT_FOUND', message: 'ไม่พบเอกสาร' },
        { status: 404 }
      );
    }
    logger.error('Update document error', { error });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      { status: 500 }
    );
  }
}

export async function DELETE(
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

    if (!isAdmin(authResult.user!.role)) {
      return NextResponse.json(
        { success: false, error: 'FORBIDDEN', message: 'คุณไม่มีสิทธิ์จัดการทะเบียนรับ-ส่งเอกสาร' },
        { status: 403 }
      );
    }

    const { id } = await params;
    await prisma.documentRegister.update({
      where: { id: parseInt(id) },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true, message: 'ลบเอกสารสำเร็จ' });
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return NextResponse.json(
        { success: false, error: 'NOT_FOUND', message: 'ไม่พบเอกสาร' },
        { status: 404 }
      );
    }
    logger.error('Delete document error', { error });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      { status: 500 }
    );
  }
}
