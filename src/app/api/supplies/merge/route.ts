/**
 * POST /api/supplies/merge
 * รวมพัสดุ 2 รายการที่ชื่อซ้ำกันเป็นรายการเดียว
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isManagerOrAbove } from '@/lib/auth';
import { logger } from '@/lib/logger';

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
        { success: false, error: 'FORBIDDEN', message: 'คุณไม่มีสิทธิ์รวมรายการพัสดุ' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { primaryId, secondaryId } = body as { primaryId: number; secondaryId: number };

    if (!primaryId || !secondaryId || primaryId === secondaryId) {
      return NextResponse.json(
        { success: false, error: 'INVALID_INPUT', message: 'กรุณาระบุรหัสพัสดุที่ต้องการรวม' },
        { status: 400 }
      );
    }

    const [primary, secondary] = await Promise.all([
      prisma.supply.findUnique({ where: { id: primaryId } }),
      prisma.supply.findUnique({ where: { id: secondaryId } }),
    ]);

    if (!primary || !primary.isActive) {
      return NextResponse.json(
        { success: false, error: 'NOT_FOUND', message: 'ไม่พบพัสดุหลัก' },
        { status: 404 }
      );
    }
    if (!secondary || !secondary.isActive) {
      return NextResponse.json(
        { success: false, error: 'NOT_FOUND', message: 'ไม่พบพัสดุที่จะรวม' },
        { status: 404 }
      );
    }
    if (primary.type !== secondary.type) {
      return NextResponse.json(
        { success: false, error: 'TYPE_MISMATCH', message: 'ไม่สามารถรวมพัสดุต่างประเภทกันได้' },
        { status: 400 }
      );
    }

    const newQty = primary.currentQuantity + secondary.currentQuantity;

    const merged = await prisma.$transaction(async (tx) => {
      // Re-assign secondary's transaction history to primary
      await tx.supplyTransaction.updateMany({
        where: { supplyId: secondaryId },
        data: { supplyId: primaryId },
      });

      // Update primary quantity
      const updatedPrimary = await tx.supply.update({
        where: { id: primaryId },
        data: { currentQuantity: newQty },
        include: { category: { select: { id: true, name: true } } },
      });

      // Record ADJUST transaction for the merge
      if (primary.type === 'STOCK' && secondary.currentQuantity > 0) {
        await tx.supplyTransaction.create({
          data: {
            supplyId: primaryId,
            type: 'ADJUST',
            quantity: newQty,
            quantityBefore: primary.currentQuantity,
            quantityAfter: newQty,
            performedById: authResult.user!.id,
            notes: `รวมจากรายการรหัส ${secondaryId} (${secondary.name}) จำนวน ${secondary.currentQuantity} ${secondary.unit || ''})`,
          },
        });
      }

      // Soft-delete secondary
      await tx.supply.update({
        where: { id: secondaryId },
        data: { isActive: false },
      });

      return updatedPrimary;
    });

    logger.info('Supplies merged', { primaryId, secondaryId, newQty, userId: authResult.user!.id });

    return NextResponse.json({
      success: true,
      data: { ...merged, unitPrice: merged.unitPrice ? Number(merged.unitPrice) : null },
      message: `รวมพัสดุสำเร็จ — จำนวนรวม ${newQty} ${primary.unit || ''}`,
    });
  } catch (error) {
    logger.error('Merge supplies error', { error });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      { status: 500 }
    );
  }
}
