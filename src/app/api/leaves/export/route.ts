/**
 * ==================================================
 * API Route: GET /api/leaves/export
 * ==================================================
 * API สำหรับ Export ข้อมูลการลาเป็น CSV
 * รองรับการกรองด้วยชื่อ ระยะเวลา และเลือกคอลัมน์
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { csvCell } from '@/lib/excel-safe';
import { requireAuth, isManagerOrAbove } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { safeGetGregorianYear } from '@/lib/utils';
import { parseLeaveTab } from '@/lib/leave-tabs';
import { buildLeaveTabWhere } from '@/lib/leave-tabs-server';

/**
 * คอลัมน์ทั้งหมดที่รองรับ
 */
const ALL_COLUMNS = ['id', 'name', 'department', 'type', 'startDate', 'endDate', 'days', 'reason', 'status', 'approvedBy', 'createdAt', 'formCategory'] as const;
type ColumnKey = typeof ALL_COLUMNS[number];

const COLUMN_HEADERS: Record<ColumnKey, string> = {
  id: 'รหัส',
  name: 'ชื่อพนักงาน',
  department: 'แผนก',
  type: 'ประเภทการลา',
  startDate: 'วันที่เริ่ม',
  endDate: 'วันที่สิ้นสุด',
  days: 'จำนวนวัน',
  reason: 'เหตุผล',
  status: 'สถานะ',
  approvedBy: 'ผู้อนุมัติ',
  createdAt: 'วันที่บันทึก',
  formCategory: 'ประเภทแบบฟอร์ม',
};

/**
 * แปลงข้อมูลเป็น CSV format พร้อมเลือกคอลัมน์
 */
function convertToCSV(data: any[], columns: ColumnKey[]): string {
  if (data.length === 0) return '';

  const headers = columns.map(col => COLUMN_HEADERS[col]);

  const rows = data.map(item => {
    return columns.map(col => {
      switch (col) {
        case 'id': return item.id;
        case 'name': return `${item.user.prefix || ''}${item.user.name}`;
        case 'department': return item.user.department || '-';
        case 'type': return translateLeaveType(item.type);
        case 'startDate': return formatDate(item.startDate);
        case 'endDate': return formatDate(item.endDate);
        case 'days': return calculateDays(item.startDate, item.endDate, item.isHalfDay, item.hours);
        case 'reason': return item.reason;
        case 'status': return translateStatus(item.status);
        case 'approvedBy': return item.approvedBy || '-';
        case 'createdAt': return formatDate(item.createdAt);
        case 'formCategory': return translateFormCategory(item.formCategory);
        default: return '';
      }
    });
  });

  // Add BOM for Thai language support
  // หัวคอลัมน์เป็นค่าคงที่จึงไม่ต้อง quote; เซลล์ข้อมูลทุกตัวผ่าน csvCell: ครอบ "" + escape + กัน formula injection (ชื่อ/เหตุผลที่ผู้ใช้กรอกขึ้นต้นด้วย = + - @)
  return '\uFEFF' + [headers.join(','), ...rows.map(row => row.map(csvCell).join(','))].join('\n');
}

/**
 * แปลงประเภทการลาเป็นภาษาไทย
 */
function translateLeaveType(type: string): string {
  const types: Record<string, string> = {
    'SICK': 'ลาป่วย',
    'PERSONAL': 'ลากิจ',
    'MATERNITY': 'ลาคลอดบุตร',
    'ORDINATION': 'ลาบวช',
    'EARLY_LEAVE': 'ออกก่อนเวลา',
    'LATE_ARRIVAL': 'มาสาย',
    'RUN_AN_ERRAND': 'ออกนอกเขตพระราชฐาน',
    'OTHER': 'อื่นๆ',
  };
  return types[type] || type;
}

/**
 * แปลงประเภทแบบฟอร์มเป็นภาษาไทย
 */
function translateFormCategory(formCategory: string | null): string {
  if (formCategory === 'KBK') return 'แบบส่ง กบก.';
  if (formCategory === 'STATS') return 'แบบเก็บสถิติ';
  return '-';
}

/**
 * แปลงสถานะเป็นภาษาไทย
 */
function translateStatus(status: string): string {
  const statuses: Record<string, string> = {
    'PENDING': 'รอพิจารณา',
    'APPROVED': 'อนุมัติ',
    'REJECTED': 'ไม่อนุมัติ',
  };
  return statuses[status] || status;
}

/**
 * จัดรูปแบบวันที่
 */
function formatDate(date: Date | string): string {
  const d = new Date(date);
  // ป้องกันบวก พ.ศ. ซ้ำ กรณีปีใน DB เป็น พ.ศ. อยู่แล้ว (legacy data)
  const correctedYear = safeGetGregorianYear(d);
  if (correctedYear !== d.getFullYear()) {
    d.setFullYear(correctedYear);
  }
  return d.toLocaleDateString('th-TH', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

/**
 * คำนวณจำนวนวัน (รองรับครึ่งวันและรายชั่วโมง)
 */
function calculateDays(startDate: Date | string, endDate: Date | string, isHalfDay?: boolean, hours?: number | null): string {
  if (hours && hours > 0) {
    if (hours <= 3) return '0.5';
    if (hours >= 8) return '1';
    return (hours / 8).toFixed(1);
  }
  if (isHalfDay) return '0.5';
  const start = new Date(startDate);
  const end = new Date(endDate);
  const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return days.toString();
}

/**
 * GET /api/leaves/export
 * Export ข้อมูลการลาเป็น CSV
 *
 * Query Parameters:
 * - name: ค้นหาด้วยชื่อพนักงาน
 * - startDate: วันเริ่มต้น (YYYY-MM-DD)
 * - endDate: วันสิ้นสุด (YYYY-MM-DD)
 * - formCategory: กรองตามประเภทแบบฟอร์ม (KBK = แบบส่ง กบก., STATS = แบบเก็บสถิติ) - legacy, ใช้ tab แทน
 * - tab: กรองตามแท็บ (KBK, STATS, LATE_ARRIVAL) ดู src/lib/leave-tabs.ts
 * - columns: คอลัมน์ที่ต้องการ (comma-separated)
 *
 * Response: CSV file download
 */
export async function GET(request: NextRequest) {
  try {
    // ตรวจสอบการเข้าสู่ระบบ
    const authResult = await requireAuth(request);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, error: authResult.error, message: authResult.message },
        { status: authResult.status }
      );
    }

    // ดึง query parameters
    const { searchParams } = new URL(request.url);
    const name = searchParams.get('name');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const formCategory = searchParams.get('formCategory');
    const tab = parseLeaveTab(searchParams.get('tab'));
    const columnsParam = searchParams.get('columns');

    // กำหนดคอลัมน์ที่จะ export
    let selectedColumns: ColumnKey[];
    if (columnsParam) {
      selectedColumns = columnsParam.split(',').filter(
        (col): col is ColumnKey => ALL_COLUMNS.includes(col as ColumnKey)
      );
      if (selectedColumns.length === 0) {
        selectedColumns = [...ALL_COLUMNS];
      }
    } else {
      selectedColumns = [...ALL_COLUMNS];
    }

    // สร้าง where clause
    const where: any = {};
    const and: any[] = [...buildLeaveTabWhere(tab)];

    // ถ้าไม่ใช่ manager ขึ้นไป ให้ export ได้เฉพาะรายการตัวเอง (เหมือน GET /api/leaves)
    if (!isManagerOrAbove(authResult.user!.role)) {
      where.userId = authResult.user!.id;
    }

    // กรองด้วยชื่อ
    if (name) {
      where.user = {
        name: {
          contains: name,
        },
      };
    }

    // กรองด้วยประเภทแบบฟอร์ม (แบบส่ง กบก. / แบบเก็บสถิติ)
    if (formCategory === 'KBK' || formCategory === 'STATS') {
      where.formCategory = formCategory;
    }

    // กรองด้วยระยะเวลา
    if (startDate && endDate) {
      and.push({ startDate: { gte: new Date(startDate) } }, { endDate: { lte: new Date(endDate) } });
    } else if (startDate) {
      and.push({ startDate: { gte: new Date(startDate) } });
    } else if (endDate) {
      and.push({ endDate: { lte: new Date(endDate) } });
    }

    if (and.length) {
      where.AND = and;
    }

    // ดึงข้อมูลการลา
    const leaves = await prisma.leave.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            prefix: true,
            name: true,
            department: true,
          },
        },
      },
      orderBy: { startDate: 'desc' },
    });

    // แปลงเป็น CSV
    const csv = convertToCSV(leaves, selectedColumns);

    // สร้างชื่อไฟล์
    const fileName = `leaves_export_${new Date().toISOString().split('T')[0]}.csv`;

    // ส่งไฟล์ CSV
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });

  } catch (error) {
    logger.error('Export leaves error', { error });
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
