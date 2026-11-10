/**
 * ==================================================
 * API Route: /api/position-seconds
 * ==================================================
 * API สำหรับจัดการตำแหน่งรอง (CRUD operations)
 * เฉพาะ Admin เท่านั้นที่สามารถจัดการได้
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isManagerOrAbove } from '@/lib/auth';
import { logger } from '@/lib/logger';

/**
 * GET /api/position-seconds
 * ดึงรายการตำแหน่งรองทั้งหมด
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

    const positionSeconds = await prisma.positionSecond.findMany({
      orderBy: [{ isActive: 'desc' }, { order: 'asc' }, { name: 'asc' }],
    });

    return NextResponse.json({
      success: true,
      data: positionSeconds,
    });
  } catch (error) {
    logger.error('Get position seconds error', { error });
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
 * POST /api/position-seconds
 * สร้างตำแหน่งรองใหม่ (เฉพาะ Admin)
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
    
    const positionSecond = await prisma.positionSecond.create({
      data: {
        name: body.name,
        description: body.description || null,
        hasLevel: body.hasLevel || false,
        maxLevel: body.maxLevel || null,
        order: body.order || 0,
        isActive: body.isActive ?? true,
      },
    });

    return NextResponse.json({
      success: true,
      data: positionSecond,
      message: 'สร้างตำแหน่งรองสำเร็จ',
    }, { status: 201 });
  } catch (error) {
    logger.error('Create position second error', { error });
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
 * PATCH /api/position-seconds
 * อัปเดตตำแหน่งรอง (เฉพาะ Admin)
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
          message: 'กรุณาระบุ ID ของตำแหน่งรอง',
        },
        { status: 400 }
      );
    }

    const positionSecond = await prisma.positionSecond.update({
      where: { id: parseInt(id) },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      data: positionSecond,
      message: 'อัปเดตตำแหน่งรองสำเร็จ',
    });
  } catch (error) {
    logger.error('Update position second error', { error });
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
 * DELETE /api/position-seconds
 * ลบตำแหน่งรอง (เฉพาะ Admin)
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
          message: 'กรุณาระบุ ID ของตำแหน่งรอง',
        },
        { status: 400 }
      );
    }

    await prisma.positionSecond.delete({
      where: { id: parseInt(id) },
    });

    return NextResponse.json({
      success: true,
      message: 'ลบตำแหน่งรองสำเร็จ',
    });
  } catch (error) {
    logger.error('Delete position second error', { error });
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
