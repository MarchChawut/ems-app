/**
 * ==================================================
 * Excel/CSV Safe - กัน formula injection ในไฟล์ที่ส่งออก
 * ==================================================
 * ข้อความที่ผู้ใช้กรอก (ชื่อ/เรื่อง/เหตุผล/หมายเหตุ ฯลฯ) ถ้าขึ้นต้นด้วย = + - @ (หรือ tab/CR) เมื่อเปิดใน
 * Excel/LibreOffice จะถูกตีความเป็นสูตร (เช่น =HYPERLINK(...), DDE) ทำให้ข้อมูลรั่วหรือสั่งรันคำสั่งบนเครื่องผู้เปิดไฟล์ได้
 * วิธีกัน (OWASP CSV Injection): นำหน้าด้วย ' เพื่อให้เป็นข้อความธรรมดา
 *
 * ยกเว้นข้อความที่ "หน้าตาเป็นตัวเลข/เบอร์โทร" ล้วน (เช่น -5, +66 81-234-5678) และเครื่องหมายขีดเดี่ยว "-" ที่ใช้แทนค่าว่าง
 * เพราะไม่ใช่สูตรและการเติม ' จะทำให้อ่านยาก — แต่ = และ @ นำหน้าถูกกันเสมอ
 */

import type ExcelJS from 'exceljs';

const ALWAYS_DANGEROUS = /^[=@\t\r]/;
const SIGN_LEADING = /^[+-]/;
const NUMBER_LIKE = /^[+-]?[\d\s().,\-/]+$/;

/** คืนข้อความที่ปลอดภัยต่อ formula injection (ค่าที่ไม่ใช่ string คืนเดิม) */
export function neutralizeFormula<T>(value: T): T | string {
  if (typeof value !== 'string' || value.length === 0) return value;
  if (ALWAYS_DANGEROUS.test(value)) return `'${value}`;
  if (SIGN_LEADING.test(value)) {
    if (value === '-' || NUMBER_LIKE.test(value)) return value;
    return `'${value}`;
  }
  return value;
}

/** ผ่านทุก cell ที่เป็น string ใน workbook แล้วกัน formula injection ก่อนเขียนไฟล์ */
export function sanitizeWorkbook(wb: ExcelJS.Workbook): void {
  wb.eachSheet((ws) => {
    ws.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        if (typeof cell.value === 'string') {
          cell.value = neutralizeFormula(cell.value) as string;
        }
      });
    });
  });
}

/** เซลล์ CSV: กัน formula injection + ครอบ "..." และ escape เครื่องหมายคำพูด/คอมมา/ขึ้นบรรทัดใหม่ให้ถูกต้อง */
export function csvCell(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  const safe = neutralizeFormula(raw) as string;
  return `"${safe.replace(/"/g, '""')}"`;
}
