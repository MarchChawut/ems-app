/**
 * ==================================================
 * API Route: PATCH /api/asset-checkouts/[id]
 * ==================================================
 * คืนครุภัณฑ์ (atomic: set returnedAt + reset asset)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isManagerOrAbove } from '@/lib/auth';
import { logger } from '@/lib/logger';

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
        { success: false, error: 'FORBIDDEN', message: 'คุณไม่มีสิทธิ์รับคืนครุภัณฑ์' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const checkoutId = parseInt(id);
    const body = await request.json();
    const notes = body?.notes as string | undefined;

    const updated = await prisma.$transaction(async (tx) => {
      const checkout = await tx.assetCheckout.findUnique({ where: { id: checkoutId } });

      if (!checkout) {
        throw new Error('NOT_FOUND:ไม่พบรายการยืม');
      }

      if (checkout.returnedAt) {
        throw new Error('ALREADY_RETURNED:คืนครุภัณฑ์นี้ไปแล้ว');
      }

      const [updatedCheckout] = await Promise.all([
        tx.assetCheckout.update({
          where: { id: checkoutId },
          data: {
            returnedAt: new Date(),
            ...(notes !== undefined && { notes }),
          },
          include: {
            asset: { select: { id: true, name: true, assetTag: true } },
            holder: { select: { id: true, prefix: true, name: true } },
          },
        }),
        tx.asset.update({
          where: { id: checkout.assetId },
          data: { currentHolderId: null, status: 'AVAILABLE' },
        }),
      ]);

      return updatedCheckout;
    });

    logger.info('Asset returned', { checkoutId, assetId: updated.asset?.id });

    return NextResponse.json({
      success: true,
      data: updated,
      message: 'คืนครุภัณฑ์สำเร็จ',
    });
  } catch (error: any) {
    const msg = error?.message || '';
    if (msg.startsWith('NOT_FOUND:')) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND', message: msg.slice(10) }, { status: 404 });
    }
    if (msg.startsWith('ALREADY_RETURNED:')) {
      return NextResponse.json({ success: false, error: 'ALREADY_RETURNED', message: msg.slice(17) }, { status: 400 });
    }
    logger.error('Return asset checkout error', { error });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      { status: 500 }
    );
  }
}
