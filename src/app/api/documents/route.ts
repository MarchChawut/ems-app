/**
 * ==================================================
 * API Route: /api/documents
 * ==================================================
 * GET รายการเอกสารรับ-ส่ง / POST บันทึกเอกสารใหม่
 */

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { createDocumentRegisterSchema } from '@/lib/security';
import { requireAuth, isAdmin } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { toSafeGregorianDate } from '@/lib/utils';

export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const direction = searchParams.get('direction');
    const search = searchParams.get('search');

    const where: any = { isActive: true };
    if (direction === 'RECEIVE' || direction === 'SEND') where.direction = direction;
    if (search) {
      where.OR = [
        { subject: { contains: search } },
        { documentNumber: { contains: search } },
        { recipientName: { contains: search } },
        { senderName: { contains: search } },
      ];
    }

    const documents = await prisma.documentRegister.findMany({
      where,
      include: {
        recordedBy: { select: { id: true, prefix: true, name: true, avatar: true } },
      },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
    });

    return NextResponse.json({ success: true, data: documents, meta: { total: documents.length } });
  } catch (error) {
    logger.error('Get documents error', { error });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      { status: 500 }
    );
  }
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

    if (!isAdmin(authResult.user!.role)) {
      return NextResponse.json(
        { success: false, error: 'FORBIDDEN', message: 'คุณไม่มีสิทธิ์จัดการทะเบียนรับ-ส่งเอกสาร' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const result = createDocumentRegisterSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: 'VALIDATION_ERROR', message: 'ข้อมูลไม่ถูกต้อง', details: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const data: Prisma.DocumentRegisterUncheckedCreateInput = {
      ...result.data,
      date: toSafeGregorianDate(result.data.date),
      recordedById: authResult.user!.id,
    };

    const document = await prisma.documentRegister.create({
      data,
      include: {
        recordedBy: { select: { id: true, prefix: true, name: true, avatar: true } },
      },
    });

    return NextResponse.json({
      success: true,
      data: document,
      message: 'บันทึกเอกสารสำเร็จ',
    }, { status: 201 });
  } catch (error) {
    logger.error('Create document error', { error });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      { status: 500 }
    );
  }
}
