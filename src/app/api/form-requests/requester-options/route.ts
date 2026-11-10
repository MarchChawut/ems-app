/**
 * ==================================================
 * API Route: GET /api/form-requests/requester-options
 * ==================================================
 * รายชื่อสำหรับ dropdown "ข้าพเจ้า" ในใบขอรับการสนับสนุนรถยนต์
 * - ADMIN/SUPER_ADMIN: ผู้ใช้ที่ active ทุกคน
 * - ผู้ใช้อื่นที่มีสิทธิ์ขอรถยนต์: เฉพาะตัวเอง
 * และรายชื่อ ผบ.ชา. (MANAGER/DIRECTOR) สำหรับช่อง "ผู้อนุมัติการใช้รถ"
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { canUseFormTemplate } from '@/lib/permissions';
import { listRequesterOptions, listApproverOptions, listCoordinatorOptions } from '@/lib/form-requests';
import { VEHICLE_REQUEST_SYSTEM_KEY } from '@/lib/vehicle-request';
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
    const user = authResult.user!;
    if (!canUseFormTemplate(user, VEHICLE_REQUEST_SYSTEM_KEY)) {
      return NextResponse.json(
        { success: false, error: 'FORBIDDEN', message: 'คุณไม่มีสิทธิ์ใช้แบบฟอร์มนี้' },
        { status: 403 }
      );
    }
    const [requesters, approvers, coordinators] = await Promise.all([
      listRequesterOptions(user),
      listApproverOptions(),
      listCoordinatorOptions(user),
    ]);
    return NextResponse.json({ success: true, data: { requesters, approvers, coordinators } });
  } catch (error) {
    logger.error('Get requester options error', { error });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      { status: 500 }
    );
  }
}
