/**
 * ==================================================
 * API Route: /api/supplies
 * ==================================================
 * GET รายการพัสดุ / POST สร้างพัสดุ
 */

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { createSupplySchema } from '@/lib/security';
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

    if (authResult.user!.role === 'EMPLOYEE') {
      return NextResponse.json(
        { success: false, error: 'FORBIDDEN', message: 'คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const search = searchParams.get('search');
    const categoryId = searchParams.get('categoryId');
    const lowStock = searchParams.get('lowStock') === 'true';

    // แบ่งหน้าแบบ opt-in: ใช้เฉพาะเมื่อมีการส่ง page หรือ limit มาจริง
    // (ไม่ส่งมา = คืน array เต็มเหมือนเดิม เพื่อไม่ให้ dropdown/ตารางเดิมพัง)
    // ทำ pagination ที่ระดับ array หลังกรอง lowStock เสมอ เพราะ lowStock กรองใน memory
    // อยู่แล้ว การ skip/take ที่ query DB ตรงๆ จะให้ผลลัพธ์หน้าไม่ตรงเมื่อรวมกับ lowStock
    const hasPagination = searchParams.has('page') || searchParams.has('limit');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1);
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50') || 50));

    const where: any = { isActive: true };
    if (type) where.type = type;
    if (categoryId) where.categoryId = parseInt(categoryId);
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { supplier: { contains: search } },
        { documentNumber: { contains: search } },
      ];
    }

    let supplies = await prisma.supply.findMany({
      where,
      include: {
        category: { select: { id: true, name: true } },
        _count: { select: { transactions: true } },
      },
      orderBy: { name: 'asc' },
    });

    if (lowStock) {
      supplies = supplies.filter(s => s.type === 'STOCK' && s.currentQuantity <= s.minimumQuantity);
    }

    const total = supplies.length;
    const pageSupplies = hasPagination
      ? supplies.slice((page - 1) * limit, (page - 1) * limit + limit)
      : supplies;

    const data = pageSupplies.map(s => ({
      ...s,
      unitPrice: s.unitPrice ? Number(s.unitPrice) : null,
    }));

    return NextResponse.json({
      success: true,
      data,
      meta: hasPagination ? { total, page, limit, hasMore: page * limit < total } : { total },
    });
  } catch (error) {
    logger.error('Get supplies error', { error });
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
        { success: false, error: 'FORBIDDEN', message: 'คุณไม่มีสิทธิ์จัดการพัสดุ' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const result = createSupplySchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: 'VALIDATION_ERROR', message: 'ข้อมูลไม่ถูกต้อง', details: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const data: Prisma.SupplyUncheckedCreateInput = {
      ...result.data,
      issueDate: result.data.issueDate ? new Date(result.data.issueDate) : null,
    };

    const supply = await prisma.supply.create({
      data,
      include: { category: { select: { id: true, name: true } } },
    });

    // Auto-create RECEIVE transaction when initial quantity > 0
    if (supply.currentQuantity > 0) {
      await prisma.supplyTransaction.create({
        data: {
          supplyId: supply.id,
          type: 'RECEIVE',
          quantity: supply.currentQuantity,
          quantityBefore: 0,
          quantityAfter: supply.currentQuantity,
          performedById: authResult.user!.id,
          recipientName: supply.recorderName || null,
          documentNumber: supply.documentNumber || null,
          documentUrl: supply.documentUrl || null,
          notes: 'บันทึกจำนวนเริ่มต้น',
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: { ...supply, unitPrice: supply.unitPrice ? Number(supply.unitPrice) : null },
      message: 'สร้างพัสดุสำเร็จ',
    }, { status: 201 });
  } catch (error) {
    logger.error('Create supply error', { error });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      { status: 500 }
    );
  }
}
