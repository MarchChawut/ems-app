/**
 * ==================================================
 * API Route: /api/supplies/[id]
 * ==================================================
 * GET / PATCH / DELETE พัสดุเดี่ยว
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createSupplySchema } from '@/lib/security';
import { requireAuth, isManagerOrAbove } from '@/lib/auth';
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

    if (authResult.user!.role === 'EMPLOYEE') {
      return NextResponse.json(
        { success: false, error: 'FORBIDDEN', message: 'คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const supplyId = parseInt(id);

    const supply = await prisma.supply.findUnique({
      where: { id: supplyId },
      include: {
        category: { select: { id: true, name: true } },
        transactions: {
          include: {
            performedBy: { select: { id: true, prefix: true, name: true, avatar: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    });

    if (!supply) {
      return NextResponse.json(
        { success: false, error: 'NOT_FOUND', message: 'ไม่พบพัสดุ' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { ...supply, unitPrice: supply.unitPrice ? Number(supply.unitPrice) : null },
    });
  } catch (error) {
    logger.error('Get supply error', { error });
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

    if (!isManagerOrAbove(authResult.user!.role)) {
      return NextResponse.json(
        { success: false, error: 'FORBIDDEN', message: 'คุณไม่มีสิทธิ์จัดการพัสดุ' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const result = createSupplySchema.partial().safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: 'VALIDATION_ERROR', message: 'ข้อมูลไม่ถูกต้อง', details: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const data = {
      ...result.data,
      ...(result.data.issueDate !== undefined && {
        issueDate: result.data.issueDate ? new Date(result.data.issueDate) : null,
      }),
    };

    const supply = await prisma.supply.update({
      where: { id: parseInt(id) },
      data,
      include: { category: { select: { id: true, name: true } } },
    });

    return NextResponse.json({
      success: true,
      data: { ...supply, unitPrice: supply.unitPrice ? Number(supply.unitPrice) : null },
      message: 'อัปเดตพัสดุสำเร็จ',
    });
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return NextResponse.json(
        { success: false, error: 'NOT_FOUND', message: 'ไม่พบพัสดุ' },
        { status: 404 }
      );
    }
    logger.error('Update supply error', { error });
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

    if (!isManagerOrAbove(authResult.user!.role)) {
      return NextResponse.json(
        { success: false, error: 'FORBIDDEN', message: 'คุณไม่มีสิทธิ์จัดการพัสดุ' },
        { status: 403 }
      );
    }

    const { id } = await params;
    await prisma.supply.update({
      where: { id: parseInt(id) },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true, message: 'ลบพัสดุสำเร็จ' });
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return NextResponse.json(
        { success: false, error: 'NOT_FOUND', message: 'ไม่พบพัสดุ' },
        { status: 404 }
      );
    }
    logger.error('Delete supply error', { error });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      { status: 500 }
    );
  }
}
