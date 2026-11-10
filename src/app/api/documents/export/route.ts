/**
 * ==================================================
 * API Route: GET /api/documents/export
 * ==================================================
 * Export ทะเบียนรับ-ส่งเอกสารเป็น Excel (.xlsx)
 *
 * Query Params:
 *   direction  RECEIVE | SEND | all (default: all)
 *   period     day | week | month | custom (default: month)
 *   startDate  YYYY-MM-DD (required when period=custom)
 *   endDate    YYYY-MM-DD (required when period=custom)
 */

import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { sanitizeWorkbook } from '@/lib/excel-safe';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { logger } from '@/lib/logger';

// ─── Labels ────────────────────────────────────────────────────────────────

const DIRECTION_LABELS: Record<string, string> = {
  RECEIVE: 'หนังสือเข้า',
  SEND: 'หนังสือออก',
};

const DOCUMENT_CATEGORY_LABELS: Record<string, string> = {
  MEMO: 'บันทึกข้อความ',
  EXTERNAL_LETTER: 'หนังสือภายนอก',
  PW_NEWS: 'พว.แจ้งข่าว',
  VEHICLE_SUPPORT_REQUEST: 'ขอรับสนับสนุนยานพาหนะ',
  REFRESHMENT_SUPPORT_REQUEST: 'ขอรับสนับสนุนอาหารว่าง',
};

// ─── Helpers ───────────────────────────────────────────────────────────────

const TZ_OFFSET_MS = 7 * 60 * 60 * 1000; // UTC+7

function getPeriodRange(
  period: string,
  startDate?: string | null,
  endDate?: string | null,
): { gte: Date; lte: Date } | null {
  if (period === 'custom' && startDate && endDate) {
    return { gte: new Date(startDate), lte: new Date(endDate) };
  }

  // DocumentRegister.date เป็น @db.Date (ไม่มีเวลา) และถูกเขียนด้วย new Date("YYYY-MM-DD")
  // เสมอ (ดู documents/route.ts) จึงต้องเทียบด้วยสตริงวันที่ปฏิทินไทยแบบเดียวกัน
  // ไม่ใช่ timestamp จริงแบบ getPeriodRange ของ supplies export (ซึ่งเทียบกับคอลัมน์ createdAt ที่เป็น DateTime เต็มรูปแบบ)
  const nowThai = new Date(Date.now() + TZ_OFFSET_MS);
  const todayStr = nowThai.toISOString().split('T')[0];

  if (period === 'day') {
    return { gte: new Date(todayStr), lte: new Date(todayStr) };
  }

  if (period === 'week') {
    const day = nowThai.getUTCDay(); // 0=Sun
    const daysFromMonday = day === 0 ? 6 : day - 1;
    const startOfWeek = new Date(nowThai);
    startOfWeek.setUTCDate(nowThai.getUTCDate() - daysFromMonday);
    const startStr = startOfWeek.toISOString().split('T')[0];
    return { gte: new Date(startStr), lte: new Date(todayStr) };
  }

  if (period === 'month') {
    const startOfMonthStr = `${todayStr.slice(0, 7)}-01`;
    return { gte: new Date(startOfMonthStr), lte: new Date(todayStr) };
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

function periodLabel(period: string, startDate?: string | null, endDate?: string | null): string {
  if (period === 'day') return 'วันนี้';
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

    // ข้อมูลสรุประดับกอง (ใบลา/คลัง/ครุภัณฑ์ของทุกคน) — พนักงานทั่วไปไม่มีสิทธิ์ (หน้าแดชบอร์ดก็ redirect EMPLOYEE ออกอยู่แล้ว
    // แต่ต้องกันที่ API ด้วย ไม่ใช่แค่ซ่อน UI)
    if (authResult.user!.role === 'EMPLOYEE') {
      return NextResponse.json(
        { success: false, error: 'FORBIDDEN', message: 'คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const directionParam = searchParams.get('direction') || 'all';
    const categoryParam = searchParams.get('category') || 'all';
    const period = searchParams.get('period') || 'month';
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (period === 'custom' && (!startDate || !endDate)) {
      return NextResponse.json(
        { success: false, error: 'BAD_REQUEST', message: 'กรุณาระบุ startDate และ endDate สำหรับการกำหนดเอง' },
        { status: 400 },
      );
    }

    const directionFilter = directionParam === 'RECEIVE' || directionParam === 'SEND' ? directionParam : undefined;
    const categoryFilter = (['MEMO', 'EXTERNAL_LETTER', 'PW_NEWS', 'VEHICLE_SUPPORT_REQUEST', 'REFRESHMENT_SUPPORT_REQUEST'] as const).includes(categoryParam as 'MEMO' | 'EXTERNAL_LETTER' | 'PW_NEWS' | 'VEHICLE_SUPPORT_REQUEST' | 'REFRESHMENT_SUPPORT_REQUEST')
      ? (categoryParam as 'MEMO' | 'EXTERNAL_LETTER' | 'PW_NEWS' | 'VEHICLE_SUPPORT_REQUEST' | 'REFRESHMENT_SUPPORT_REQUEST')
      : undefined;
    const dateRange = getPeriodRange(period, startDate, endDate);

    const documents = await prisma.documentRegister.findMany({
      where: {
        isActive: true,
        ...(directionFilter ? { direction: directionFilter } : {}),
        ...(categoryFilter ? { category: categoryFilter } : {}),
        ...(dateRange ? { date: dateRange } : {}),
      },
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
    });

    // ── Build workbook ────────────────────────────────────────────────────
    const wb = new ExcelJS.Workbook();
    wb.creator = 'EMS-TRD';
    wb.created = new Date();

    const directionLabel = directionFilter ? DIRECTION_LABELS[directionFilter] : 'ทั้งหมด';
    const categoryLabel = categoryFilter ? DOCUMENT_CATEGORY_LABELS[categoryFilter] : 'ทุกประเภท';
    const pLabel = periodLabel(period, startDate, endDate);
    const todayStr = thaiDate(new Date());

    const ws = wb.addWorksheet('ทะเบียนรับ-ส่งเอกสาร');

    const cols = [
      { header: 'ลำดับ', width: 8 },
      { header: 'วันที่', width: 16 },
      { header: 'เลขที่เอกสาร', width: 20 },
      { header: 'ประเภท', width: 16 },
      { header: 'ทิศทาง', width: 12 },
      { header: 'เรื่อง', width: 36 },
      { header: 'ชื่อผู้ส่ง', width: 22 },
      { header: 'ชื่อผู้รับ', width: 22 },
      { header: 'หมายเหตุ', width: 28 },
    ];

    ws.columns = cols.map(c => ({ width: c.width }));

    const titleText = `ทะเบียนรับ-ส่งเอกสาร — ${directionLabel} — ${categoryLabel} — ${pLabel} (พิมพ์ ณ วันที่ ${todayStr})`;
    const titleRow = ws.addRow([]);
    applyTitleStyle(titleRow, cols.length, titleText);

    const headerRow = ws.addRow(cols.map(c => c.header));
    applyHeaderStyle(headerRow, '1E40AF');

    if (documents.length === 0) {
      const emptyRow = ws.addRow([]);
      ws.mergeCells(emptyRow.number, 1, emptyRow.number, cols.length);
      const cell = emptyRow.getCell(1);
      cell.value = 'ไม่มีรายการในช่วงเวลาที่เลือก';
      cell.font = { name: FONT_THAI, size: 11, color: { argb: 'FF6B7280' }, italic: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      emptyRow.height = 28;
    } else {
      const directionColor: Record<string, string> = {
        RECEIVE: 'FFD1FAE5',
        SEND: 'FFDBEAFE',
      };
      const directionFontColor: Record<string, string> = {
        RECEIVE: 'FF065F46',
        SEND: 'FF1E40AF',
      };

      const categoryColor: Record<string, string> = {
        MEMO: 'FFFEF3C7',
        EXTERNAL_LETTER: 'FFEDE9FE',
        PW_NEWS: 'FFCFFAFE',
        VEHICLE_SUPPORT_REQUEST: 'FFFFE4E6',
        REFRESHMENT_SUPPORT_REQUEST: 'FFECFCCB',
      };
      const categoryFontColor: Record<string, string> = {
        MEMO: 'FF92400E',
        EXTERNAL_LETTER: 'FF5B21B6',
        PW_NEWS: 'FF155E75',
        VEHICLE_SUPPORT_REQUEST: 'FF9F1239',
        REFRESHMENT_SUPPORT_REQUEST: 'FF3F6212',
      };

      documents.forEach((d, i) => {
        const row = ws.addRow([
          i + 1,
          thaiDate(d.date),
          d.documentNumber || '',
          d.category ? (DOCUMENT_CATEGORY_LABELS[d.category] || d.category) : '',
          DIRECTION_LABELS[d.direction] || d.direction,
          d.subject,
          d.senderName || '',
          d.recipientName || '',
          d.remarks || '',
        ]);
        setRowHeight(row, 20);
        row.eachCell(cell => applyDataCell(cell));

        const catCell = row.getCell(4);
        if (d.category) {
          catCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: categoryColor[d.category] || 'FFFFFFFF' } };
          catCell.font = { name: FONT_THAI, size: 10, bold: true, color: { argb: categoryFontColor[d.category] || 'FF000000' } };
        }
        catCell.alignment = { horizontal: 'center', vertical: 'middle' };

        const dirCell = row.getCell(5);
        dirCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: directionColor[d.direction] || 'FFFFFFFF' } };
        dirCell.font = { name: FONT_THAI, size: 10, bold: true, color: { argb: directionFontColor[d.direction] || 'FF000000' } };
        dirCell.alignment = { horizontal: 'center', vertical: 'middle' };

        row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };

        if ((i + 1) % 2 === 0) {
          row.eachCell((cell, colNum) => {
            if (colNum !== 4 && colNum !== 5) {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
            }
          });
        }
      });
    }

    // ── Write buffer & respond ─────────────────────────────────────────────
    // กัน formula injection: ข้อความที่ผู้ใช้กรอกที่ขึ้นต้นด้วย = + - @ จะถูกตีความเป็นสูตรเมื่อเปิดใน Excel
    sanitizeWorkbook(wb);
    const buf = await wb.xlsx.writeBuffer();
    const dateStr = new Date().toISOString().split('T')[0];
    const periodKey = period === 'day' ? 'วันนี้' : period === 'week' ? 'สัปดาห์นี้' : period === 'month' ? 'เดือนนี้' : 'กำหนดเอง';
    const filename = `document_register_${directionLabel}_${categoryLabel}_${periodKey}_${dateStr}.xlsx`;
    const encodedFilename = encodeURIComponent(filename);

    return new NextResponse(Buffer.from(buf as ArrayBuffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="document_register_${dateStr}.xlsx"; filename*=UTF-8''${encodedFilename}`,
      },
    });
  } catch (error) {
    logger.error('Export documents error', { error });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      { status: 500 },
    );
  }
}
