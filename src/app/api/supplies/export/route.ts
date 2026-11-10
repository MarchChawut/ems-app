/**
 * ==================================================
 * API Route: GET /api/supplies/export
 * ==================================================
 * Export รายงานพัสดุเป็น Excel (.xlsx) หลายชีท
 *
 * Query Params:
 *   type       STOCK | NON_STOCK | all (default: all)
 *   period     week | month | custom (default: month)
 *   startDate  YYYY-MM-DD (required when period=custom)
 *   endDate    YYYY-MM-DD (required when period=custom)
 */

import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { sanitizeWorkbook } from '@/lib/excel-safe';
import { prisma } from '@/lib/prisma';
import { requireAuth, isManagerOrAbove } from '@/lib/auth';
import { logger } from '@/lib/logger';

// ─── Labels ────────────────────────────────────────────────────────────────

const SUPPLY_TYPE_LABELS: Record<string, string> = {
  STOCK: 'คงคลัง',
  NON_STOCK: 'ไม่คงคลัง',
};

const TX_TYPE_LABELS: Record<string, string> = {
  RECEIVE: 'รับเข้า',
  ISSUE: 'เบิกจ่าย',
  RETURN: 'คืน',
  ADJUST: 'ปรับยอด',
};

// ─── Helpers ───────────────────────────────────────────────────────────────

const TZ_OFFSET_MS = 7 * 60 * 60 * 1000; // UTC+7

function getPeriodRange(
  period: string,
  startDate?: string | null,
  endDate?: string | null,
): { gte: Date; lte: Date } | null {
  if (period === 'custom' && startDate && endDate) {
    return {
      gte: new Date(startDate + 'T00:00:00+07:00'),
      lte: new Date(endDate + 'T23:59:59+07:00'),
    };
  }

  const nowUtc = Date.now();
  const nowThai = new Date(nowUtc + TZ_OFFSET_MS);

  if (period === 'week') {
    const day = nowThai.getUTCDay(); // 0=Sun
    const daysFromMonday = day === 0 ? 6 : day - 1;
    const startOfWeekThai = new Date(nowThai);
    startOfWeekThai.setUTCDate(nowThai.getUTCDate() - daysFromMonday);
    startOfWeekThai.setUTCHours(0, 0, 0, 0);
    return {
      gte: new Date(startOfWeekThai.getTime() - TZ_OFFSET_MS),
      lte: new Date(),
    };
  }

  if (period === 'month') {
    const startOfMonthThai = new Date(nowThai);
    startOfMonthThai.setUTCDate(1);
    startOfMonthThai.setUTCHours(0, 0, 0, 0);
    return {
      gte: new Date(startOfMonthThai.getTime() - TZ_OFFSET_MS),
      lte: new Date(),
    };
  }

  return null;
}

function thaiDate(d: Date | string | null | undefined): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function thaiDateTime(d: Date | string | null | undefined): string {
  if (!d) return '';
  return new Date(d).toLocaleString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function periodLabel(period: string, startDate?: string | null, endDate?: string | null): string {
  if (period === 'week') return 'สัปดาห์นี้';
  if (period === 'month') return 'เดือนนี้';
  if (period === 'custom' && startDate && endDate) {
    return `${thaiDate(startDate)} – ${thaiDate(endDate)}`;
  }
  return 'ทั้งหมด';
}

// ─── Styling helpers ────────────────────────────────────────────────────────

const FONT_THAI = 'Tahoma';

function applyHeaderStyle(row: ExcelJS.Row, bgArgb: string) {
  row.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + bgArgb } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: FONT_THAI, size: 11 };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF9CA3AF' } },
      bottom: { style: 'thin', color: { argb: 'FF9CA3AF' } },
      left: { style: 'thin', color: { argb: 'FF9CA3AF' } },
      right: { style: 'thin', color: { argb: 'FF9CA3AF' } },
    };
  });
  row.height = 28;
}

function applyTitleStyle(row: ExcelJS.Row, colCount: number, text: string) {
  row.worksheet.mergeCells(row.number, 1, row.number, colCount);
  const cell = row.getCell(1);
  cell.value = text;
  cell.font = { bold: true, size: 13, name: FONT_THAI, color: { argb: 'FF1E3A5F' } };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F4FF' } };
  row.height = 36;
}

function applyDataCell(cell: ExcelJS.Cell) {
  cell.font = { name: FONT_THAI, size: 10 };
  cell.alignment = { vertical: 'middle', wrapText: false };
  cell.border = {
    top: { style: 'hair', color: { argb: 'FFE5E7EB' } },
    bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } },
    left: { style: 'hair', color: { argb: 'FFE5E7EB' } },
    right: { style: 'hair', color: { argb: 'FFE5E7EB' } },
  };
}

function setRowHeight(row: ExcelJS.Row, h: number) {
  row.height = h;
}

// ─── Supply Summary Sheet Builder ───────────────────────────────────────────

type SupplyWithCategory = {
  id: number; name: string; type: string; supplyCode: string | null;
  unit: string | null; currentQuantity: number; minimumQuantity: number;
  maximumQuantity: number; thresholdYellow: number; supplier: string | null;
  unitPrice: unknown; documentNumber: string | null; notes: string | null;
  issueDate: Date | null; createdAt: Date; updatedAt: Date;
  category: { name: string } | null;
};

function buildSupplySummarySheet(
  wb: ExcelJS.Workbook,
  sheetName: string,
  supplies: SupplyWithCategory[],
  titleText: string,
) {
  const ws = wb.addWorksheet(sheetName);

  const cols = [
    { header: 'ลำดับ', width: 8 },
    { header: 'รหัสพัสดุ', width: 16 },
    { header: 'ชื่อพัสดุ', width: 30 },
    { header: 'ประเภท', width: 14 },
    { header: 'หมวดหมู่', width: 18 },
    { header: 'หน่วย', width: 12 },
    { header: 'คงเหลือ', width: 12 },
    { header: 'ขั้นต่ำ', width: 10 },
    { header: 'สูงสุด', width: 10 },
    { header: 'ผู้จำหน่าย', width: 22 },
    { header: 'ราคา/หน่วย (บาท)', width: 18 },
    { header: 'เลขที่เอกสาร', width: 18 },
    { header: 'วันที่บันทึก', width: 16 },
    { header: 'หมายเหตุ', width: 28 },
  ];

  ws.columns = cols.map(c => ({ width: c.width }));

  const titleRow = ws.addRow([]);
  applyTitleStyle(titleRow, cols.length, titleText);

  const headerRow = ws.addRow(cols.map(c => c.header));
  applyHeaderStyle(headerRow, '1E40AF');

  supplies.forEach((s, i) => {
    const isStock = s.type === 'STOCK';
    const row = ws.addRow([
      i + 1,
      s.supplyCode || '',
      s.name,
      SUPPLY_TYPE_LABELS[s.type] || s.type,
      s.category?.name || '',
      s.unit || '',
      isStock ? s.currentQuantity : '',
      isStock ? s.minimumQuantity : '',
      isStock ? s.maximumQuantity : '',
      s.supplier || '',
      s.unitPrice ? Number(s.unitPrice) : '',
      s.documentNumber || '',
      thaiDate(s.issueDate || s.createdAt),
      s.notes || '',
    ]);
    setRowHeight(row, 20);
    row.eachCell(cell => applyDataCell(cell));

    if (isStock) {
      const qtyCell = row.getCell(7);
      if (s.currentQuantity <= s.minimumQuantity) {
        qtyCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
        qtyCell.font = { name: FONT_THAI, size: 10, bold: true, color: { argb: 'FFDC2626' } };
      } else {
        const thresholdQty = s.minimumQuantity * (s.thresholdYellow / 100) + s.minimumQuantity;
        if (s.currentQuantity <= thresholdQty) {
          qtyCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF9C3' } };
          qtyCell.font = { name: FONT_THAI, size: 10, bold: true, color: { argb: 'FFD97706' } };
        }
      }
      qtyCell.alignment = { horizontal: 'center', vertical: 'middle' };
    }

    if (s.unitPrice) {
      const priceCell = row.getCell(11);
      priceCell.numFmt = '#,##0.00';
      priceCell.alignment = { horizontal: 'right', vertical: 'middle' };
    }

    if ((i + 1) % 2 === 0) {
      row.eachCell((cell, colNum) => {
        if (colNum !== 7 || !isStock || s.currentQuantity > s.minimumQuantity) {
          if (!cell.fill || (cell.fill as ExcelJS.FillPattern).fgColor?.argb === 'FFFFFFFF') {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
          }
        }
      });
    }
  });
}

// ─── Route Handler ──────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, error: authResult.error, message: authResult.message },
        { status: authResult.status },
      );
    }

    if (!isManagerOrAbove(authResult.user!.role)) {
      return NextResponse.json(
        { success: false, error: 'FORBIDDEN', message: 'คุณไม่มีสิทธิ์ Export ข้อมูล' },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);
    const typeParam = searchParams.get('type') || 'all';
    const period = searchParams.get('period') || 'month';
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (period === 'custom' && (!startDate || !endDate)) {
      return NextResponse.json(
        { success: false, error: 'BAD_REQUEST', message: 'กรุณาระบุ startDate และ endDate สำหรับการกำหนดเอง' },
        { status: 400 },
      );
    }

    const supplyTypeFilter = typeParam !== 'all' ? typeParam : undefined;
    const dateRange = getPeriodRange(period, startDate, endDate);

    // ── Parallel DB queries ────────────────────────────────────────────────
    const [supplies, transactions, lowStockRaw] = await Promise.all([
      // Sheet 1: current inventory
      prisma.supply.findMany({
        where: {
          isActive: true,
          ...(supplyTypeFilter ? { type: supplyTypeFilter as 'STOCK' | 'NON_STOCK' } : {}),
        },
        include: { category: { select: { name: true } } },
        orderBy: [{ type: 'asc' }, { name: 'asc' }],
      }),

      // Sheet 2: transaction history in date range
      prisma.supplyTransaction.findMany({
        where: {
          ...(dateRange ? { createdAt: dateRange } : {}),
          ...(supplyTypeFilter ? { supply: { type: supplyTypeFilter as 'STOCK' | 'NON_STOCK' } } : {}),
          supply: { isActive: true, ...(supplyTypeFilter ? { type: supplyTypeFilter as 'STOCK' | 'NON_STOCK' } : {}) },
        },
        include: {
          supply: { select: { id: true, name: true, unit: true, type: true } },
          performedBy: { select: { prefix: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 5001, // fetch 1 extra to detect truncation
      }),

      // Sheet 3: low stock STOCK items (always STOCK regardless of type param)
      prisma.supply.findMany({
        where: {
          isActive: true,
          type: 'STOCK',
          minimumQuantity: { gt: 0 },
        },
        include: { category: { select: { name: true } } },
        orderBy: { currentQuantity: 'asc' },
      }),
    ]);

    const lowStock = lowStockRaw.filter(s => s.currentQuantity <= s.minimumQuantity);
    const txTruncated = transactions.length > 5000;
    const txRows = txTruncated ? transactions.slice(0, 5000) : transactions;

    // ── Build workbook ────────────────────────────────────────────────────
    const wb = new ExcelJS.Workbook();
    wb.creator = 'EMS-TRD';
    wb.created = new Date();

    const typeLabel = typeParam === 'STOCK' ? 'คงคลัง' : typeParam === 'NON_STOCK' ? 'ไม่คงคลัง' : 'ทั้งหมด';
    const pLabel = periodLabel(period, startDate, endDate);
    const todayStr = thaiDate(new Date());

    // ════════════════════════════════════════════════════════════════════════
    // SHEET 1 (+ SHEET 2 when all) — สรุปพัสดุ
    // ════════════════════════════════════════════════════════════════════════
    if (typeParam === 'all') {
      const stockSupplies = supplies.filter(s => s.type === 'STOCK');
      const nonStockSupplies = supplies.filter(s => s.type === 'NON_STOCK');
      buildSupplySummarySheet(wb, 'คงคลัง (STOCK)', stockSupplies,
        `รายงานสรุปพัสดุ — คงคลัง — ณ วันที่ ${todayStr}`);
      buildSupplySummarySheet(wb, 'ไม่คงคลัง (NON_STOCK)', nonStockSupplies,
        `รายงานสรุปพัสดุ — ไม่คงคลัง — ณ วันที่ ${todayStr}`);
    } else {
      buildSupplySummarySheet(wb, 'สรุปพัสดุ', supplies,
        `รายงานสรุปพัสดุ — ${typeLabel} — ณ วันที่ ${todayStr}`);
    }

    // ════════════════════════════════════════════════════════════════════════
    // SHEET 2 — ประวัติการเบิก-รับ
    // ════════════════════════════════════════════════════════════════════════
    const ws2 = wb.addWorksheet('ประวัติการเบิก-รับ');

    const s2Cols = [
      { header: 'ลำดับ', width: 8 },
      { header: 'วันที่-เวลา', width: 22 },
      { header: 'ชื่อพัสดุ', width: 28 },
      { header: 'ประเภทพัสดุ', width: 14 },
      { header: 'ประเภทรายการ', width: 14 },
      { header: 'จำนวน', width: 10 },
      { header: 'คงเหลือก่อน', width: 13 },
      { header: 'คงเหลือหลัง', width: 13 },
      { header: 'หน่วย', width: 10 },
      { header: 'ผู้รับ/เบิก', width: 20 },
      { header: 'ผู้ทำรายการ', width: 20 },
      { header: 'เลขที่เอกสาร', width: 18 },
      { header: 'หมายเหตุ', width: 28 },
    ];

    ws2.columns = s2Cols.map(c => ({ width: c.width }));

    const s2TitleText = dateRange
      ? `ประวัติการเบิก-รับพัสดุ — ${typeLabel} — ${pLabel}`
      : `ประวัติการเบิก-รับพัสดุ — ${typeLabel} — ข้อมูลทั้งหมด`;
    const s2Title = ws2.addRow([]);
    applyTitleStyle(s2Title, s2Cols.length, s2TitleText);

    const s2Header = ws2.addRow(s2Cols.map(c => c.header));
    applyHeaderStyle(s2Header, '1E7A6E');

    if (txRows.length === 0) {
      const emptyRow = ws2.addRow([]);
      ws2.mergeCells(emptyRow.number, 1, emptyRow.number, s2Cols.length);
      const cell = emptyRow.getCell(1);
      cell.value = 'ไม่มีรายการในช่วงเวลาที่เลือก';
      cell.font = { name: FONT_THAI, size: 11, color: { argb: 'FF6B7280' }, italic: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      emptyRow.height = 28;
    } else {
      txRows.forEach((tx, i) => {
        const txTypeColor: Record<string, string> = {
          RECEIVE: 'FFD1FAE5',
          ISSUE: 'FFFEE2E2',
          RETURN: 'FFDBEAFE',
          ADJUST: 'FFFEF3C7',
        };
        const txTypeFontColor: Record<string, string> = {
          RECEIVE: 'FF065F46',
          ISSUE: 'FF991B1B',
          RETURN: 'FF1E40AF',
          ADJUST: 'FF92400E',
        };

        const performer = tx.performedBy
          ? (tx.performedBy.prefix || '') + tx.performedBy.name
          : '';

        const row = ws2.addRow([
          i + 1,
          thaiDateTime(tx.createdAt),
          tx.supply?.name || '',
          SUPPLY_TYPE_LABELS[tx.supply?.type || ''] || tx.supply?.type || '',
          TX_TYPE_LABELS[tx.type] || tx.type,
          tx.quantity,
          tx.quantityBefore,
          tx.quantityAfter,
          tx.supply?.unit || '',
          tx.recipientName || '',
          performer,
          tx.documentNumber || '',
          tx.notes || '',
        ]);
        setRowHeight(row, 20);
        row.eachCell(cell => applyDataCell(cell));

        // Color the transaction type cell
        const txCell = row.getCell(5);
        txCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: txTypeColor[tx.type] || 'FFFFFFFF' } };
        txCell.font = { name: FONT_THAI, size: 10, bold: true, color: { argb: txTypeFontColor[tx.type] || 'FF000000' } };
        txCell.alignment = { horizontal: 'center', vertical: 'middle' };

        // Number alignment
        [6, 7, 8].forEach(col => {
          row.getCell(col).alignment = { horizontal: 'center', vertical: 'middle' };
        });

        // Alternating fill on non-type cells
        if ((i + 1) % 2 === 0) {
          row.eachCell((cell, colNum) => {
            if (colNum !== 5) {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
            }
          });
        }
      });

      if (txTruncated) {
        const noteRow = ws2.addRow([]);
        ws2.mergeCells(noteRow.number, 1, noteRow.number, s2Cols.length);
        const cell = noteRow.getCell(1);
        cell.value = `⚠️ แสดงเฉพาะ 5,000 รายการล่าสุด (มีรายการมากกว่า 5,000 รายการในช่วงเวลานี้)`;
        cell.font = { name: FONT_THAI, size: 10, color: { argb: 'FFD97706' }, bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF9C3' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        noteRow.height = 24;
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // SHEET 3 — สินค้าใกล้หมด
    // ════════════════════════════════════════════════════════════════════════
    const ws3 = wb.addWorksheet('สินค้าใกล้หมด');

    const s3Cols = [
      { header: 'ลำดับ', width: 8 },
      { header: 'ชื่อพัสดุ', width: 30 },
      { header: 'หมวดหมู่', width: 18 },
      { header: 'คงเหลือ', width: 12 },
      { header: 'ขั้นต่ำ', width: 10 },
      { header: 'ขาด', width: 10 },
      { header: 'หน่วย', width: 10 },
      { header: 'ผู้จำหน่าย', width: 22 },
      { header: 'ราคา/หน่วย (บาท)', width: 18 },
    ];

    ws3.columns = s3Cols.map(c => ({ width: c.width }));

    const s3Title = ws3.addRow([]);
    applyTitleStyle(s3Title, s3Cols.length, `แจ้งเตือน: พัสดุคงคลังใกล้หมด — ณ วันที่ ${todayStr}`);

    const s3Header = ws3.addRow(s3Cols.map(c => c.header));
    applyHeaderStyle(s3Header, 'B45309');

    if (lowStock.length === 0) {
      const okRow = ws3.addRow([]);
      ws3.mergeCells(okRow.number, 1, okRow.number, s3Cols.length);
      const cell = okRow.getCell(1);
      cell.value = '✅ ไม่มีพัสดุที่ต่ำกว่าขั้นต่ำ';
      cell.font = { name: FONT_THAI, size: 11, color: { argb: 'FF065F46' }, bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      okRow.height = 28;
    } else {
      lowStock.forEach((s, i) => {
        const shortage = s.minimumQuantity - s.currentQuantity;
        const row = ws3.addRow([
          i + 1,
          s.name,
          s.category?.name || '',
          s.currentQuantity,
          s.minimumQuantity,
          shortage > 0 ? shortage : 0,
          s.unit || '',
          s.supplier || '',
          s.unitPrice ? Number(s.unitPrice) : '',
        ]);
        setRowHeight(row, 20);
        row.eachCell(cell => {
          applyDataCell(cell);
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF2F2' } };
        });

        // Bold qty cells
        [4, 5, 6].forEach(col => {
          const cell = row.getCell(col);
          cell.font = { name: FONT_THAI, size: 10, bold: true, color: { argb: 'FFDC2626' } };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        });

        if (s.unitPrice) {
          row.getCell(9).numFmt = '#,##0.00';
          row.getCell(9).alignment = { horizontal: 'right', vertical: 'middle' };
        }
      });
    }

    // ── Write buffer & respond ─────────────────────────────────────────────
    // กัน formula injection: ข้อความที่ผู้ใช้กรอกที่ขึ้นต้นด้วย = + - @ จะถูกตีความเป็นสูตรเมื่อเปิดใน Excel
    sanitizeWorkbook(wb);
    const buf = await wb.xlsx.writeBuffer();
    const dateStr = new Date().toISOString().split('T')[0];
    const periodKey = period === 'week' ? 'สัปดาห์นี้' : period === 'month' ? 'เดือนนี้' : 'กำหนดเอง';
    const filename = `supplies_report_${typeLabel}_${periodKey}_${dateStr}.xlsx`;
    const encodedFilename = encodeURIComponent(filename);

    return new NextResponse(Buffer.from(buf as ArrayBuffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="supplies_report_${dateStr}.xlsx"; filename*=UTF-8''${encodedFilename}`,
      },
    });
  } catch (error) {
    logger.error('Export supplies error', { error });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      { status: 500 },
    );
  }
}
