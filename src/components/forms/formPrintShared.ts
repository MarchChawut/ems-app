/**
 * ==================================================
 * Form Print Shared - โค้ดที่ใช้ร่วมกันสำหรับ preview/พิมพ์แบบฟอร์มขอเอกสารภายใน
 * ==================================================
 * แยกออกมาเพื่อไม่ให้ formatThaiDate / print-window boilerplate ถูก copy-paste
 * ซ้ำแบบเดียวกับที่เกิดขึ้นแล้วใน LeaveForm.tsx / LateArrivalForm.tsx
 */

import { cssPadding, getPageMargins, type Margins } from "./pageMargins";

/** สีหมึกปากกาลูกลื่นสีน้ำเงิน ใช้กับข้อความที่กรอกบนจุดไข่ปลาในแบบฟอร์มทุกใบ (เฉพาะค่าที่กรอก ไม่ใช่ป้ายกำกับ) */
export const INK_BLUE = "#1a3fa8";

/** สีดำ — ใช้กับชื่อในวงเล็บ ตำแหน่ง และวันที่ในบล็อกลงชื่อ (ข้อความที่พิมพ์ล่วงหน้าโดยระบบ ไม่ใช่ที่กรอกด้วยปากกา) */
export const INK_BLACK = "#000";

/**
 * คืน HTML ของพื้นที่พิมพ์ โดยตัด element ที่ติด data-no-print ออก
 * (เช่น กรอบเส้นประของลายเซ็นขณะจัดวาง) เพื่อไม่ให้หลุดไปบนกระดาษ
 */
export function getPrintableHtml(el: HTMLElement): string {
  const clone = el.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("[data-no-print]").forEach((n) => n.remove());
  return clone.innerHTML;
}

const THAI_MONTHS = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

export function formatThaiDate(date: Date | string): { day: string; month: string; year: string } {
  const d = new Date(date);
  const rawYear = d.getFullYear();
  return {
    day: d.getDate().toString(),
    month: THAI_MONTHS[d.getMonth()],
    // แปลงเป็น พ.ศ. อย่างปลอดภัย (ป้องกันบวก 543 ซ้ำ กรณีปีเป็น พ.ศ. อยู่แล้ว)
    year: (rawYear > 2500 ? rawYear : rawYear + 543).toString(),
  };
}

/** escape ตัวอักษรพิเศษของ HTML กัน title (มาจากข้อมูลที่ผู้ใช้แก้ไขได้ เช่น documentTitle
 * ของแบบฟอร์ม) หลุดออกจาก <title> แล้วฉีด markup/script เข้าไปใน print window ได้ */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * สั่งพิมพ์หน้าต่างพิมพ์เมื่อรูป (เช่น ลายเซ็นจาก /api/files/...) และฟอนต์โหลดครบแล้ว
 * แทนการเดาเวลาด้วย setTimeout ซึ่งอาจพิมพ์ออกมาก่อนรูปโหลด (ลายเซ็นหาย) บน LAN/NAS ที่ช้า
 * มีเพดานรอ maxWaitMs เพื่อไม่ให้ค้างถ้ารูปโหลดไม่ขึ้น
 */
export function printWhenReady(printWindow: Window, maxWaitMs = 3000): void {
  const doc = printWindow.document;
  doc.close();
  printWindow.focus();

  const imagesReady = Promise.all(
    Array.from(doc.images).map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) return resolve();
          img.addEventListener("load", () => resolve(), { once: true });
          img.addEventListener("error", () => resolve(), { once: true });
        })
    )
  );
  const fontsReady = doc.fonts?.ready ?? Promise.resolve();
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, maxWaitMs));

  Promise.race([Promise.all([imagesReady, fontsReady]), timeout]).then(() => {
    printWindow.print();
    printWindow.close();
  });
}

/**
 * เปิดหน้าต่างใหม่แล้วสั่งพิมพ์เนื้อหา HTML ที่กำหนด (A4, ฟอนต์ THSarabun local)
 * margins = ระยะขอบ (มม.) ของแบบฟอร์มนั้น — ดู pageMargins.ts (ไม่ระบุ = ค่า default)
 */
export function openPrintWindow(title: string, innerHtml: string, margins: Margins = getPageMargins().print): void {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${escapeHtml(title)}</title>
      <style>
        @page { size: A4; margin: 0; }
        @font-face {
          font-family: 'THSarabun';
          src: url('/fonts/THSarabun.ttf') format('truetype');
        }
        body {
          font-family: 'THSarabun', sans-serif;
          font-size: 16pt;
          line-height: 1.2;
          margin: 0;
          padding: 0;
        }
        .form-container {
          width: 210mm;
          min-height: auto;
          padding: ${cssPadding(margins)};
          box-sizing: border-box;
          page-break-inside: avoid;
        }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      </style>
    </head>
    <body>
      <div class="form-container">
        ${innerHtml}
      </div>
    </body>
    </html>
  `);

  printWhenReady(printWindow);
}

const THAI_MONTHS_SHORT = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

/**
 * วันที่ลงนามแบบย่อสำหรับช่อง "วันที่ __ / __ / __" ในบล็อกลงชื่อ เช่น 8 / พ.ย. / 69
 * (วัน / เดือนย่อ / พ.ศ. 2 หลัก) — คืน null เมื่อยังไม่มีวันที่ (ขั้นตอนนั้นยังไม่เกิดขึ้น) เพื่อให้เว้นช่องว่างไว้
 */
export interface SignDate {
  day: string;
  month: string;
  year: string;
}

export function formatSignDate(date: Date | string | null | undefined): SignDate | null {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const rawYear = d.getFullYear();
  const buddhistYear = rawYear > 2500 ? rawYear : rawYear + 543;
  return {
    day: d.getDate().toString(),
    month: THAI_MONTHS_SHORT[d.getMonth()],
    year: (buddhistYear % 100).toString().padStart(2, "0"),
  };
}
