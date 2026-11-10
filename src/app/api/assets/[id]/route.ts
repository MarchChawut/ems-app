/**
 * ==================================================
 * API Route: /api/assets/[id]
 * ==================================================
 * GET / PATCH / DELETE ครุภัณฑ์เดี่ยว
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAssetSchema } from '@/lib/security';
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

    const asset = await prisma.asset.findUnique({
      where: { id: parseInt(id) },
      include: {
        category: { select: { id: true, name: true } },
        currentHolder: { select: { id: true, prefix: true, name: true, avatar: true, department: true } },
        checkouts: {
          include: {
            holder: { select: { id: true, prefix: true, name: true, avatar: true, department: true } },
            issuedBy: { select: { id: true, name: true, avatar: true } },
          },
          orderBy: { checkedOutAt: 'desc' },
          take: 20,
        },
      },
    });

    if (!asset) {
      return NextResponse.json(
        { success: false, error: 'NOT_FOUND', message: 'ไม่พบครุภัณฑ์' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { ...asset, acquisitionCost: asset.acquisitionCost ? Number(asset.acquisitionCost) : null },
    });
  } catch (error) {
    logger.error('Get asset error', { error });
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
        { success: false, error: 'FORBIDDEN', message: 'คุณไม่มีสิทธิ์จัดการครุภัณฑ์' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const result = createAssetSchema.partial().safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: 'VALIDATION_ERROR', message: 'ข้อมูลไม่ถูกต้อง', details: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const d = result.data;
    const updateData: Record<string, unknown> = {};
    if ('name' in d) updateData.name = d.name;
    if ('assetTag' in d) updateData.assetTag = d.assetTag ?? null;
    if ('serialNumber' in d) updateData.serialNumber = d.serialNumber ?? null;
    if ('model' in d) updateData.model = d.model ?? null;
    if ('brand' in d) updateData.brand = d.brand ?? null;
    if ('categoryId' in d) updateData.categoryId = d.categoryId != null ? d.categoryId : null;
    if ('status' in d) updateData.status = d.status;
    if ('condition' in d) updateData.condition = d.condition;
    if ('acquisitionDate' in d) updateData.acquisitionDate = d.acquisitionDate ? new Date(d.acquisitionDate!) : null;
    if ('acquisitionCost' in d) updateData.acquisitionCost = d.acquisitionCost ?? null;
    if ('documentNumber' in d) updateData.documentNumber = d.documentNumber ?? null;
    if ('documentUrl' in d) updateData.documentUrl = d.documentUrl ?? null;
    if ('imageUrl' in d) updateData.imageUrl = d.imageUrl ?? null;
    if ('location' in d) updateData.location = d.location ?? null;
    if ('department' in d) updateData.department = d.department ?? null;
    if ('notes' in d) updateData.notes = d.notes ?? null;
    if ('receiverName' in d) updateData.receiverName = d.receiverName ?? null;
    if ('lastInspectionDate' in d) updateData.lastInspectionDate = d.lastInspectionDate ? new Date(d.lastInspectionDate!) : null;
    if ('lastInspectionCondition' in d) updateData.lastInspectionCondition = d.lastInspectionCondition ?? null;
    if ('lastInspectedBy' in d) updateData.lastInspectedBy = d.lastInspectedBy ?? null;

    const asset = await prisma.asset.update({
      where: { id: parseInt(id) },
      data: updateData as any,
      include: {
        category: { select: { id: true, name: true } },
        currentHolder: { select: { id: true, prefix: true, name: true, avatar: true } },
      },
    });

    return NextResponse.json({
      success: true,
      data: { ...asset, acquisitionCost: asset.acquisitionCost ? Number(asset.acquisitionCost) : null },
      message: 'อัปเดตครุภัณฑ์สำเร็จ',
    });
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return NextResponse.json(
        { success: false, error: 'NOT_FOUND', message: 'ไม่พบครุภัณฑ์' },
        { status: 404 }
      );
    }
    if (error?.code === 'P2002') {
      return NextResponse.json(
        { success: false, error: 'DUPLICATE', message: 'รหัสครุภัณฑ์นี้มีอยู่แล้ว' },
        { status: 409 }
      );
    }
    logger.error('Update asset error', { error });
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
        { success: false, error: 'FORBIDDEN', message: 'คุณไม่มีสิทธิ์จัดการครุภัณฑ์' },
        { status: 403 }
      );
    }

    const { id } = await params;
    await prisma.asset.update({
      where: { id: parseInt(id) },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true, message: 'ลบครุภัณฑ์สำเร็จ' });
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return NextResponse.json(
        { success: false, error: 'NOT_FOUND', message: 'ไม่พบครุภัณฑ์' },
        { status: 404 }
      );
    }
    logger.error('Delete asset error', { error });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      { status: 500 }
    );
  }
}
