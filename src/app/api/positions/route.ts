/**
 * ==================================================
 * API Route: /api/positions
 * ==================================================
 * API สำหรับจัดการตำแหน่งหลัก (CRUD operations)
 * เฉพาะ Admin เท่านั้นที่สามารถจัดการได้
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isManagerOrAbove } from '@/lib/auth';
import { logger } from '@/lib/logger';

/**
 * GET /api/positions
 * ดึงรายการตำแหน่งทั้งหมด
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, error: authResult.error, message: authResult.message },
        { status: authResult.status }
      );
    }

    const positions = await prisma.position.findMany({
      orderBy: [{ isActive: 'desc' }, { order: 'asc' }, { name: 'asc' }],
    });

    return NextResponse.json({
      success: true,
      data: positions,
    });
  } catch (error) {
    logger.error('Get positions error', { error });
    return NextResponse.json(
      {
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'เกิดข้อผิดพลาดภายในระบบ',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/positions
 * สร้างตำแหน่งใหม่ (เฉพาะ Admin)
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, error: authResult.error, message: authResult.message },
        { status: authResult.status }
      );
    }

    const currentUser = authResult.user!;
    
    if (!isManagerOrAbove(currentUser.role)) {
      return NextResponse.json(
        {
          success: false,
          error: 'FORBIDDEN',
          message: 'คุณไม่มีสิทธิ์จัดการตำแหน่ง',
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    
    const position = await prisma.position.create({
      data: {
        name: body.name,
        description: body.description || null,
        order: body.order || 0,
        isActive: body.isActive ?? true,
      },
    });

    return NextResponse.json({
      success: true,
      data: position,
      message: 'สร้างตำแหน่งสำเร็จ',
    }, { status: 201 });
  } catch (error) {
    logger.error('Create position error', { error });
    return NextResponse.json(
      {
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'เกิดข้อผิดพลาดภายในระบบ',
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/positions
 * อัปเดตตำแหน่ง (เฉพาะ Admin)
 */
export async function PATCH(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, error: authResult.error, message: authResult.message },
        { status: authResult.status }
      );
    }

    const currentUser = authResult.user!;
    
    if (!isManagerOrAbove(currentUser.role)) {
      return NextResponse.json(
        {
          success: false,
          error: 'FORBIDDEN',
          message: 'คุณไม่มีสิทธิ์จัดการตำแหน่ง',
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { id, ...updateData } = body;

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: 'INVALID_INPUT',
          message: 'กรุณาระบุ ID ของตำแหน่ง',
        },
        { status: 400 }
      );
    }

    const position = await prisma.position.update({
      where: { id: parseInt(id) },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      data: position,
      message: 'อัปเดตตำแหน่งสำเร็จ',
    });
  } catch (error) {
    logger.error('Update position error', { error });
    return NextResponse.json(
      {
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'เกิดข้อผิดพลาดภายในระบบ',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/positions
 * ลบตำแหน่ง (เฉพาะ Admin)
 */
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, error: authResult.error, message: authResult.message },
        { status: authResult.status }
      );
    }

    const currentUser = authResult.user!;
    
    if (!isManagerOrAbove(currentUser.role)) {
      return NextResponse.json(
        {
          success: false,
          error: 'FORBIDDEN',
          message: 'คุณไม่มีสิทธิ์จัดการตำแหน่ง',
        },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: 'INVALID_INPUT',
          message: 'กรุณาระบุ ID ของตำแหน่ง',
        },
        { status: 400 }
      );
    }

    await prisma.position.delete({
      where: { id: parseInt(id) },
    });

    return NextResponse.json({
      success: true,
      message: 'ลบตำแหน่งสำเร็จ',
    });
  } catch (error) {
    logger.error('Delete position error', { error });
    return NextResponse.json(
      {
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'เกิดข้อผิดพลาดภายในระบบ',
      },
      { status: 500 }
    );
  }
}
