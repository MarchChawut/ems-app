/**
 * ==================================================
 * API Route: /api/supply-transactions
 * ==================================================
 * GET รายการเคลื่อนไหว / POST สร้างรายการ (atomic)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createTransactionSchema } from '@/lib/security';
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
    const supplyId = searchParams.get('supplyId');
    const type = searchParams.get('type');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    const where: any = {};
    if (supplyId) where.supplyId = parseInt(supplyId);
    if (type) where.type = type;

    const [transactions, total] = await Promise.all([
      prisma.supplyTransaction.findMany({
        where,
        include: {
          supply: { select: { id: true, name: true, unit: true } },
          performedBy: { select: { id: true, prefix: true, name: true, avatar: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.supplyTransaction.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: transactions,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logger.error('Get supply transactions error', { error });
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
        { success: false, error: 'FORBIDDEN', message: 'คุณไม่มีสิทธิ์ทำรายการพัสดุ' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const result = createTransactionSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: 'VALIDATION_ERROR', message: 'ข้อมูลไม่ถูกต้อง', details: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { supplyId, type, quantity, ...rest } = result.data;

    const txRecord = await prisma.$transaction(async (tx) => {
      const supply = await tx.supply.findUnique({ where: { id: supplyId } });

      if (!supply || !supply.isActive) {
        throw new Error('NOT_FOUND:ไม่พบพัสดุ');
      }

      const qBefore = supply.currentQuantity;
      let qAfter: number;

      switch (type) {
        case 'RECEIVE':
          qAfter = qBefore + quantity;
          break;
        case 'ISSUE':
          if (qBefore < quantity) {
            throw new Error('INSUFFICIENT:จำนวนในคลังไม่เพียงพอ (คงเหลือ ' + qBefore + ' ' + (supply.unit || '') + ')');
          }
          qAfter = qBefore - quantity;
          break;
        case 'RETURN':
          qAfter = qBefore + quantity;
          break;
        case 'ADJUST':
          qAfter = quantity; // ตั้งค่าสมบูรณ์
          break;
        default:
          throw new Error('INVALID:ประเภทรายการไม่ถูกต้อง');
      }

      await tx.supply.update({
        where: { id: supplyId },
        data: { currentQuantity: qAfter },
      });

      return tx.supplyTransaction.create({
        data: {
          supplyId,
          type,
          quantity,
          quantityBefore: qBefore,
          quantityAfter: qAfter,
          performedById: authResult.user!.id,
          ...rest,
        },
        include: {
          supply: { select: { id: true, name: true, unit: true, currentQuantity: true } },
          performedBy: { select: { id: true, prefix: true, name: true, avatar: true } },
        },
      });
    });

    logger.info('Supply transaction created', { supplyId, type, quantity, userId: authResult.user!.id });

    return NextResponse.json({
      success: true,
      data: txRecord,
      message: 'บันทึกรายการสำเร็จ',
    }, { status: 201 });
  } catch (error: any) {
    const msg = error?.message || '';
    if (msg.startsWith('NOT_FOUND:')) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND', message: msg.slice(10) }, { status: 404 });
    }
    if (msg.startsWith('INVALID:')) {
      return NextResponse.json({ success: false, error: 'INVALID', message: msg.slice(8) }, { status: 400 });
    }
    if (msg.startsWith('INSUFFICIENT:')) {
      return NextResponse.json({ success: false, error: 'INSUFFICIENT_STOCK', message: msg.slice(13) }, { status: 400 });
    }
    logger.error('Create supply transaction error', { error });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      { status: 500 }
    );
  }
}
