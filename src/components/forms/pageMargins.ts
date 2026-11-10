/**
 * ==================================================
 * Page Margins - ระยะขอบกระดาษของแต่ละแบบฟอร์ม (แก้ที่ไฟล์นี้ไฟล์เดียว)
 * ==================================================
 * แต่ละแบบฟอร์มมีค่าขอบของตัวเอง แยกกัน ไม่กระทบแบบอื่น:
 *   print = ตัวอย่างใน modal + หน้าต่างพิมพ์จริง (หน่วย มม.)
 *   pdf   = ไฟล์ PDF จาก react-pdf (หน่วย pt; 1 มม. ≈ 2.835 pt — ใช้ mmToPt() ถ้าอยากตั้งเป็น มม.)
 * ลำดับค่า: top / right / bottom / left
 *
 * วิธีแก้: หาคีย์ของฟอร์มนั้นใน PAGE_MARGINS ด้านล่างแล้วแก้ตัวเลขบรรทัดเดียว
 * คีย์ที่ไม่รู้จัก (เช่น แบบฟอร์มที่แอดมินสร้างเองและไม่มี systemKey) ใช้ค่าของ "default"
 */

export interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface FormPageSetup {
  /** มม. — ตัวอย่างใน modal และหน้าต่างพิมพ์จริง */
  print: Margins;
  /** pt — ไฟล์ PDF */
  pdf: Margins;
}

const PT_PER_MM = 72 / 25.4;

/** แปลงระยะขอบจาก มม. เป็น pt (ปัดเป็นจำนวนเต็ม) สำหรับตั้งค่า pdf */
export function mmToPt(m: Margins): Margins {
  const f = (v: number) => Math.round(v * PT_PER_MM);
  return { top: f(m.top), right: f(m.right), bottom: f(m.bottom), left: f(m.left) };
}

/** ค่าเดิมที่ใช้กันมาของแบบฟอร์มทั่วไป/ใบลา (ไม่เปลี่ยน) */
const LEGACY: FormPageSetup = {
  print: { top: 15, right: 20, bottom: 10, left: 30 },
  pdf: { top: 25, right: 20, bottom: 20, left: 30 },
};

/** ใบขอรับการสนับสนุนรถยนต์: ขอบซ้าย-ขวาเท่ากัน ใช้ค่าเดียวกันทั้งตัวอย่าง พิมพ์จริง และ PDF */
const VEHICLE_MM: Margins = { top: 12, right: 10, bottom: 10, left: 12 };

/** ===== แก้ขอบของแต่ละแบบฟอร์มที่นี่ ===== */
export const PAGE_MARGINS = {
  /** แบบฟอร์มขอเอกสารภายในที่แอดมินสร้างเอง (ไม่มี systemKey) */
  default: { print: { ...LEGACY.print }, pdf: { ...LEGACY.pdf } },

  /** ใบขอรับการสนับสนุนรถยนต์ */
  VEHICLE_REQUEST: { print: { ...VEHICLE_MM }, pdf: mmToPt(VEHICLE_MM) },
  /** ขอรับสนับสนุนอาหารว่าง */
  REFRESHMENT_REQUEST: { print: { ...LEGACY.print }, pdf: { ...LEGACY.pdf } },
  /** ขอใช้ห้องประชุม */
  MEETING_ROOM_REQUEST: { print: { ...LEGACY.print }, pdf: { ...LEGACY.pdf } },
  /** ขอความอนุเคราะห์วิทยากร */
  SPEAKER_REQUEST: { print: { ...LEGACY.print }, pdf: { ...LEGACY.pdf } },

  /** ใบลา */
  LEAVE: { print: { ...LEGACY.print }, pdf: { ...LEGACY.pdf } },
  /** ใบขออนุญาตมาสาย */
  LATE_ARRIVAL: { print: { ...LEGACY.print }, pdf: { ...LEGACY.pdf } },
  /** ใบขออนุญาตออกก่อนเวลา */
  EARLY_LEAVE: { print: { ...LEGACY.print }, pdf: { ...LEGACY.pdf } },
} satisfies Record<string, FormPageSetup>;

export type FormKey = keyof typeof PAGE_MARGINS;

/** ค่าขอบของฟอร์มตามคีย์ (ไม่รู้จัก/ว่าง → default) */
export function getPageMargins(key?: string | null): FormPageSetup {
  if (key && Object.prototype.hasOwnProperty.call(PAGE_MARGINS, key)) {
    return PAGE_MARGINS[key as FormKey];
  }
  return PAGE_MARGINS.default;
}

/** "12mm 10mm 10mm 10mm" — ใช้กับ CSS padding (บน ขวา ล่าง ซ้าย) */
export function cssPadding(m: Margins): string {
  return `${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm`;
}

/** "34 28 28 28" — ใช้กับ padding ของ <Page> ใน react-pdf (หน่วย pt) */
export function pdfPadding(m: Margins): string {
  return `${m.top} ${m.right} ${m.bottom} ${m.left}`;
}
