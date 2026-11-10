/**
 * ==================================================
 * API Route: GET /api/assets/export
 * ==================================================
 * Export รายการครุภัณฑ์เป็น Excel (.xlsx) 2 sheet:
 *   1. ครุภัณฑ์ — รายการทั้งหมด
 *   2. ประวัติการเบิก-คืน — ทุก checkout
 */

import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { sanitizeWorkbook } from '@/lib/excel-safe';
import { prisma } from '@/lib/prisma';
import { requireAuth, isManagerOrAbove } from '@/lib/auth';
import { logger } from '@/lib/logger';

const STATUS_LABELS: Record<string, string> = {
  AVAILABLE: 'พร้อมใช้งาน',
  IN_USE: 'ถูกใช้งาน',
  IN_REPAIR: 'ส่งซ่อม',
  RETURNED: 'ส่งคืนคลัง',
  DISPOSED: 'ตัดจำหน่าย',
};

const CONDITION_LABELS: Record<string, string> = {
  EXCELLENT: 'ดีมาก',
  GOOD: 'ดี',
  FAIR: 'พอใช้',
  POOR: 'ไม่ดี',
  DAMAGED: 'เสียหาย',
};

function fmtDate(d: Date | string | null | undefined) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('th-TH');
}

export async function GET(request: NextRequest) {
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
        { success: false, error: 'FORBIDDEN', message: 'คุณไม่มีสิทธิ์ Export ข้อมูล' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    const where: any = { isActive: true };
    if (status) where.status = status;

    const [assets, checkouts] = await Promise.all([
      prisma.asset.findMany({
        where,
        include: {
          category: { select: { name: true } },
          currentHolder: { select: { prefix: true, name: true } },
        },
        orderBy: { name: 'asc' },
      }),
      prisma.assetCheckout.findMany({
        where: { asset: where },
        include: {
          asset: { select: { name: true, assetTag: true } },
          holder: { select: { prefix: true, name: true } },
          issuedBy: { select: { prefix: true, name: true } },
        },
        orderBy: { checkedOutAt: 'desc' },
      }),
    ]);

    // ── Sheet 1: ครุภัณฑ์ ────────────────────────────────────────────────
    const headers1 = [
      'รหัส', 'ชื่อครุภัณฑ์', 'รหัสครุภัณฑ์', 'ยี่ห้อ', 'รุ่น',
      'หมวดหมู่', 'สถานะ', 'สภาพ', 'ผู้ครอบครอง', 'แผนก', 'สถานที่',
      'วันที่จัดซื้อ', 'ผู้รับ-บันทึก', 'เลขที่เอกสาร',
      'วันที่ตรวจล่าสุด', 'สภาพล่าสุด', 'ผู้ตรวจ',
    ];

    const rows1 = assets.map(a => [
      a.id,
      a.name || '',
      a.assetTag || '',
      a.brand || '',
      a.model || '',
      a.category?.name || '',
      STATUS_LABELS[a.status] || a.status,
      CONDITION_LABELS[a.condition] || a.condition,
      (a.currentHolder?.prefix || '') + (a.currentHolder?.name || ''),
      a.department || '',
      a.location || '',
      fmtDate(a.acquisitionDate),
      (a as any).receiverName || '',
      a.documentNumber || '',
      fmtDate((a as any).lastInspectionDate),
      (a as any).lastInspectionCondition ? (CONDITION_LABELS[(a as any).lastInspectionCondition] || '') : '',
      (a as any).lastInspectedBy || '',
    ]);

    const wb = new ExcelJS.Workbook();
    const ws1 = wb.addWorksheet('ครุภัณฑ์');
    ws1.addRow(headers1);
    rows1.forEach((r) => ws1.addRow(r));
    headers1.forEach((_, i) => {
      ws1.getColumn(i + 1).width = [6, 28, 16, 16, 16, 14, 14, 10, 20, 14, 16, 14, 18, 16, 14, 10, 16][i] || 12;
    });
    ws1.getRow(1).font = { bold: true };

    // ── Sheet 2: ประวัติการเบิก-คืน ─────────────────────────────────────
    const headers2 = [
      'ลำดับ', 'ชื่อครุภัณฑ์', 'รหัสครุภัณฑ์', 'ผู้เบิก',
      'วันที่เบิก', 'กำหนดคืน', 'วันที่คืน', 'ระยะเวลา (วัน)',
      'ผู้จ่าย/อนุมัติ', 'หมายเหตุ',
    ];

    const rows2 = checkouts.map((co, i) => {
      const start = new Date(co.checkedOutAt);
      const end = co.returnedAt ? new Date(co.returnedAt) : new Date();
      const days = Math.ceil((end.getTime() - start.getTime()) / 86400000);
      const holderN = (co.holder?.prefix || '') + (co.holder?.name || '');
      const issuerN = (co.issuedBy?.prefix || '') + (co.issuedBy?.name || '');
      return [
        i + 1,
        co.asset?.name || '',
        co.asset?.assetTag || '',
        holderN,
        fmtDate(co.checkedOutAt),
        fmtDate(co.expectedReturnAt),
        co.returnedAt ? fmtDate(co.returnedAt) : 'ยังไม่คืน',
        days,
        issuerN,
        co.notes || '',
      ];
    });

    const ws2 = wb.addWorksheet('ประวัติการเบิก-คืน');
    ws2.addRow(headers2);
    rows2.forEach((r) => ws2.addRow(r));
    headers2.forEach((_, i) => {
      ws2.getColumn(i + 1).width = [6, 28, 14, 20, 14, 14, 14, 14, 20, 24][i] || 12;
    });
    ws2.getRow(1).font = { bold: true };

    // กัน formula injection: ชื่อ/ยี่ห้อ/หมายเหตุที่ผู้ใช้กรอกขึ้นต้นด้วย = + - @ จะถูกตีความเป็นสูตรเมื่อเปิดใน Excel
    sanitizeWorkbook(wb);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const dateStr = new Date().toISOString().split('T')[0];

    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="assets_export_${dateStr}.xlsx"`,
      },
    });
  } catch (error) {
    logger.error('Export assets error', { error });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      { status: 500 }
    );
  }
}
