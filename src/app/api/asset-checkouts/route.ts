/**
 * ==================================================
 * API Route: /api/asset-checkouts
 * ==================================================
 * GET รายการยืม-คืน / POST ยืมครุภัณฑ์ (atomic)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createCheckoutSchema } from '@/lib/security';
import { requireAuth, isManagerOrAbove } from '@/lib/auth';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, error: authResult.error, message: authResult.message },
        { status: authResult.status }
      );
    }

    const { searchParams } = new URL(request.url);
    const assetId = searchParams.get('assetId');
    const holderId = searchParams.get('holderId');
    const active = searchParams.get('active') === 'true';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    const where: any = {};
    if (assetId) where.assetId = parseInt(assetId);
    if (holderId) where.holderId = parseInt(holderId);
    if (active) where.returnedAt = null;

    const [checkouts, total] = await Promise.all([
      prisma.assetCheckout.findMany({
        where,
        include: {
          asset: { select: { id: true, name: true, assetTag: true } },
          holder: { select: { id: true, prefix: true, name: true, avatar: true, department: true } },
          issuedBy: { select: { id: true, name: true, avatar: true } },
        },
        orderBy: { checkedOutAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.assetCheckout.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: checkouts,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logger.error('Get asset checkouts error', { error });
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

    if (!isManagerOrAbove(authResult.user!.role)) {
      return NextResponse.json(
        { success: false, error: 'FORBIDDEN', message: 'คุณไม่มีสิทธิ์ยืมครุภัณฑ์' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const result = createCheckoutSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: 'VALIDATION_ERROR', message: 'ข้อมูลไม่ถูกต้อง', details: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { assetId, holderId, expectedReturnAt, notes, issuedById: overrideIssuedById } = result.data;

    const checkout = await prisma.$transaction(async (tx) => {
      const asset = await tx.asset.findUnique({ where: { id: assetId } });

      if (!asset || !asset.isActive) {
        throw new Error('NOT_FOUND:ไม่พบครุภัณฑ์');
      }

      if (asset.status !== 'AVAILABLE') {
        throw new Error('UNAVAILABLE:ครุภัณฑ์ไม่พร้อมใช้งาน (สถานะ: ' + asset.status + ')');
      }

      const holder = await tx.user.findUnique({ where: { id: holderId } });
      if (!holder || !holder.isActive) {
        throw new Error('INVALID:ไม่พบผู้ยืมหรือบัญชีไม่ได้ใช้งาน');
      }

      const [newCheckout] = await Promise.all([
        tx.assetCheckout.create({
          data: {
            assetId,
            holderId,
            issuedById: overrideIssuedById ?? authResult.user!.id,
            expectedReturnAt: expectedReturnAt ? new Date(expectedReturnAt) : null,
            notes,
          },
          include: {
            holder: { select: { id: true, prefix: true, name: true, avatar: true } },
            issuedBy: { select: { id: true, name: true } },
          },
        }),
        tx.asset.update({
          where: { id: assetId },
          data: { currentHolderId: holderId, status: 'IN_USE' },
        }),
      ]);

      return newCheckout;
    });

    logger.info('Asset checked out', { assetId, holderId, issuedById: authResult.user!.id });

    return NextResponse.json({
      success: true,
      data: checkout,
      message: 'ยืมครุภัณฑ์สำเร็จ',
    }, { status: 201 });
  } catch (error: any) {
    const msg = error?.message || '';
    if (msg.startsWith('NOT_FOUND:')) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND', message: msg.slice(10) }, { status: 404 });
    }
    if (msg.startsWith('UNAVAILABLE:')) {
      return NextResponse.json({ success: false, error: 'UNAVAILABLE', message: msg.slice(12) }, { status: 400 });
    }
    if (msg.startsWith('INVALID:')) {
      return NextResponse.json({ success: false, error: 'INVALID', message: msg.slice(8) }, { status: 400 });
    }
    logger.error('Create asset checkout error', { error });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      { status: 500 }
    );
  }
}
