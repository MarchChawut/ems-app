/**
 * ==================================================
 * Vehicle Request - ใบขอรับการสนับสนุนรถยนต์ (กองพระราชพาหนะ 904 พระที่นั่งอัมพรสถาน)
 * ==================================================
 * 1) VEHICLE_REQUEST_FIELDS: ฟิลด์ของแบบฟอร์ม (ใช้ใน prisma/seed.ts)
 * 2) buildVehicleLayout(): สร้าง "โครงหน้ากระดาษ" แบบ declarative จากข้อมูลคำขอ
 *    ใช้ร่วมกันทั้งหน้าพิมพ์ HTML และ PDF (@react-pdf) เพื่อให้สองที่เหมือนกันเสมอ
 *    ไฟล์นี้ไม่มี JSX/DOM จึง import ได้จากทั้ง client และ script (tsx)
 */

import { DEFAULT_ORG, type OrgInfo } from './org-settings';

export const VEHICLE_REQUEST_SYSTEM_KEY = 'VEHICLE_REQUEST';

/** ฟิลด์ที่ระบบเติมเอง ไม่แสดงในฟอร์มกรอก */
export const VEHICLE_HIDDEN_FIELD_KEYS = ['requesterName', 'approverName'];

/** ผบ.ชา. ผู้อนุมัติการใช้รถ เลือกได้เฉพาะ role หัวหน้าขึ้นไป (ไม่รวมแอดมินระบบ) */
export const VEHICLE_APPROVER_ROLES = ['MANAGER', 'DIRECTOR'] as const;

/** แหล่งรายชื่อของฟิลด์ชนิด user: requester = ข้าพเจ้า (admin ทุกคน/คนอื่นตัวเอง), approver = MANAGER/DIRECTOR */
export const VEHICLE_USER_FIELD_SOURCES: Record<string, 'requester' | 'approver' | 'coordinator'> = {
  requesterUserId: 'requester',
  approverUserId: 'approver',
  coordinatorUserId: 'coordinator',
  submitterUserId: 'coordinator',
};

/**
 * ช่อง "เลือกคน + อื่นๆ (กรอกชื่อเอง) + เบอร์เติมอัตโนมัติ": id → ชื่อฟิลด์ชื่อ/เบอร์
 * เลือกจากรายชื่อ → เซิร์ฟเวอร์เติมชื่อจาก DB; เลือก "อื่นๆ" → ผู้ใช้กรอกชื่อ (nameKey) เอง
 */
export const VEHICLE_PERSON_FIELDS: Record<string, { nameKey: string; phoneKey: string }> = {
  coordinatorUserId: { nameKey: 'coordinator', phoneKey: 'coordinatorPhone' },
  submitterUserId: { nameKey: 'submitterName', phoneKey: 'submitterPhone' },
};

/** ช่องจำนวนที่ต้องเป็นจำนวนเต็ม ≥ 1 (จำนวนรถ จำนวนเที่ยว ผู้โดยสาร) */
export const MAX_VEHICLE_COUNT = 1000;
export const VEHICLE_POSITIVE_INT_KEYS = ['vehicleCount', 'tripCount', 'passengerCount'];

/** ฟิลด์ที่เอาออกจากฟอร์มแล้ว — seed ลบทิ้งจากแม่แบบ (ค่าในคำขอเก่ายังอยู่ใน data แต่ไม่แสดง) */
export const REMOVED_VEHICLE_FIELD_KEYS = ['returnTime', 'driverName'];

/** ตรวจช่องจำนวน: ค่าที่กรอกต้องเป็นจำนวนเต็ม ≥ 1 (ว่าง/ไม่ส่ง = ผ่าน) คืนข้อความผิดพลาดหรือ null */
export function validateVehicleCounts(data: Record<string, unknown>): string | null {
  for (const key of VEHICLE_POSITIVE_INT_KEYS) {
    const v = data[key];
    if (v === null || v === undefined || v === '') continue;
    // รับเฉพาะ number จริง (ไม่แปลงสตริง) เป็นจำนวนเต็ม 1..1000 — เพดานกันค่าใหญ่ผิดปกติที่ทำให้เอกสารพิมพ์เพี้ยน
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > MAX_VEHICLE_COUNT) {
      return `จำนวนต้องเป็นจำนวนเต็มตั้งแต่ 1 ถึง ${MAX_VEHICLE_COUNT}`;
    }
  }
  return null;
}

/** ค่าในฟอร์มของตัวเลือก "อื่นๆ" ของ dropdown ผู้ประสานงาน (ไม่ถูกบันทึกลงข้อมูล — บันทึกเป็น coordinatorUserId = null + ชื่อที่กรอกเอง) */
export const COORDINATOR_OTHER = 'other';

export interface RequesterSourceUser {
  prefix?: string | null;
  name: string;
  position?: string | null;
  positionSecond?: string | null;
  positionLevel?: number | null;
  department?: string | null;
  division?: string | null;
  phone?: string | null;
  section?: string | null;
}

/**
 * ข้อมูลผู้ขอที่เติมลงใบอัตโนมัติจากบัญชีผู้ใช้ (ใช้ทั้งฝั่ง client เติมฟอร์ม และ server เขียนทับกันปลอมชื่อ)
 * - ตำแหน่ง: ตำแหน่งรอง + ระดับ (เช่น "เจ้าหน้าที่งานในพระองค์ ระดับ 3") ถ้าไม่มีใช้ตำแหน่งหลัก
 * - กอง: ตัดคำนำหน้า "กอง" ออก เพราะใบพิมพ์คำว่า "กอง" ไว้แล้ว
 * - กรม: สังกัด (division) ของผู้ใช้
 */
export function buildRequesterSnapshot(user: RequesterSourceUser): {
  name: string;
  position: string;
  division: string;
  bureau: string;
  phone: string;
  section: string;
} {
  const second = (user.positionSecond ?? '').trim();
  const level = user.positionLevel ? ` ระดับ ${user.positionLevel}` : '';
  const position = second ? `${second}${level}` : (user.position ?? '').trim();
  return {
    name: `${(user.prefix ?? '').trim()}${user.name.trim()}`,
    position,
    division: (user.department ?? '').trim().replace(/^กอง\s*/, ''),
    bureau: (user.division ?? '').trim(),
    phone: (user.phone ?? '').trim(),
    section: (user.section ?? '').trim(),
  };
}

/** ประเภทรถ (ตรงกับช่องติ๊กในใบจริง) */
export const VEHICLE_TYPE_OPTIONS = [
  'เก๋งชั้นดี',
  'ตู้ VIP 9 ที่นั่ง',
  'ตู้ธุรการ',
  'ตู้ถอดเบาะ (โล่ง)',
  'กระบะ 4 ประตู',
  'มินิบัส',
  'บัส',
  'บรรทุก',
] as const;
export const VEHICLE_TYPE_OTHER = 'อื่นๆ';

/** ช่องว่างระหว่างกล่องติ๊กกับข้อความในแถวประเภทรถ (มม.) — ช่องว่างระหว่างตัวเลือกยืดเองให้ชิดซ้าย-ขวาเต็มบรรทัด */
export const VEHICLE_TYPE_BOX_GAP_MM = 1.2;

/** ถึง บก.ปล่อยรถ — เลือกจากรายการ หรือ "อื่นๆ" แล้วกรอกเอง (addressToOther) */
export const OTHER_OPTION = 'อื่นๆ';
export const ADDRESS_TO_OTHER = OTHER_OPTION;
export const ADDRESS_TO_OPTIONS = ['พระที่นั่งอัมพรสถาน', OTHER_OPTION];

/** ส่วนราชการ — เลือกจากรายการ หรือ "อื่นๆ" แล้วกรอกเอง (departmentOther) */
export const DEPARTMENT_OPTIONS = [DEFAULT_ORG.divisionName, OTHER_OPTION];

/**
 * ใส่ชื่อสังกัดปัจจุบัน (จากข้อมูลหน่วยงานหลัก) เป็นตัวเลือกแรกของช่อง "ส่วนราชการ" ในแม่แบบใบขอรถยนต์
 * ตัวเลือกใน DB เป็นค่าตอน seed ซึ่งล้าสมัยเมื่อแอดมินเปลี่ยนชื่อ — ใช้ทั้งฝั่งแสดงฟอร์มและฝั่งตรวจข้อมูล
 * แม่แบบอื่น/ฟิลด์อื่นคืนตามเดิม
 */
export function applyOrgToVehicleFields<
  F extends { key: string; options?: unknown },
  T extends { systemKey?: string | null; fields: F[] },
>(template: T, org: OrgInfo): T {
  if (template.systemKey !== VEHICLE_REQUEST_SYSTEM_KEY) return template;
  return {
    ...template,
    fields: template.fields.map((f) => (f.key === 'department' ? { ...f, options: [org.divisionName, OTHER_OPTION] } : f)),
  };
}

/** ช่อง "ระบุ" ที่แสดง/บังคับกรอกเฉพาะเมื่อช่องหลักเลือก "อื่นๆ" → คีย์ของช่องหลัก */
export const OTHER_FIELD_PARENTS: Record<string, string> = {
  addressToOther: 'addressTo',
  departmentOther: 'department',
  vehicleOther: 'vehicleTypes',
};

/** ช่องหลักเลือก "อื่นๆ" อยู่หรือไม่ — รองรับทั้ง select (string) และ checkbox (string[]) */
export function isOtherSelected(parentValue: unknown): boolean {
  if (Array.isArray(parentValue)) return parentValue.includes(OTHER_OPTION);
  return parentValue === OTHER_OPTION;
}

interface SeedField {
  key: string;
  label: string;
  inputType: 'text' | 'number' | 'time' | 'date' | 'textarea' | 'select' | 'checkbox' | 'tel' | 'user';
  required: boolean;
  options?: string[];
}

/** ลำดับ = ลำดับในฟอร์มกรอก; key เดิม (destination, purpose, departTime, passengerCount) คงไว้ */
export const VEHICLE_REQUEST_FIELDS: SeedField[] = [
  { key: 'department', label: 'ส่วนราชการ', inputType: 'select', required: false, options: DEPARTMENT_OPTIONS },
  { key: 'departmentOther', label: 'ระบุ (กรณีเลือกอื่นๆ)', inputType: 'text', required: false },
  // ข้าพเจ้า — เลือกจากรายชื่อผู้ใช้ (admin เลือกได้ทุกคน, คนอื่นได้แค่ตัวเอง); requesterName เซิร์ฟเวอร์เติมจากฐานข้อมูลเสมอ
  { key: 'requesterUserId', label: 'ข้าพเจ้า (ชื่อผู้ขอใช้รถ)', inputType: 'user', required: true },
  { key: 'requesterName', label: 'ชื่อผู้ขอใช้รถ (ระบบเติมให้)', inputType: 'text', required: false },
  { key: 'addressTo', label: 'ถึง บก.ปล่อยรถ', inputType: 'select', required: false, options: ADDRESS_TO_OPTIONS },
  { key: 'addressToOther', label: 'ระบุ (กรณีเลือกอื่นๆ)', inputType: 'text', required: false },
  { key: 'requesterPosition', label: 'ตำแหน่ง', inputType: 'text', required: false },
  { key: 'affiliation', label: 'สังกัด ส่วนราชการ/ฝ่าย', inputType: 'text', required: false },
  { key: 'section', label: 'แผนก', inputType: 'text', required: false },
  { key: 'division', label: 'กอง', inputType: 'text', required: false },
  { key: 'bureau', label: 'กรม', inputType: 'text', required: false },
  { key: 'vehicleCount', label: 'จำนวนรถ (คัน)', inputType: 'number', required: true },
  {
    key: 'vehicleTypes',
    label: 'ประเภทรถ',
    inputType: 'checkbox',
    required: true,
    options: [...VEHICLE_TYPE_OPTIONS, VEHICLE_TYPE_OTHER],
  },
  { key: 'vehicleOther', label: 'ประเภทรถอื่นๆ (ระบุ)', inputType: 'text', required: false },
  { key: 'purpose', label: 'สำหรับภารกิจ', inputType: 'text', required: true },
  { key: 'originPlace', label: 'ตำบลต้นทาง', inputType: 'text', required: false },
  { key: 'viaPlace', label: 'ตำบลระหว่างทาง', inputType: 'text', required: false },
  { key: 'destination', label: 'ตำบลปลายทาง', inputType: 'text', required: true },
  { key: 'tripDate', label: 'ในวันที่', inputType: 'date', required: false },
  { key: 'departTime', label: 'เวลา', inputType: 'time', required: false },
  { key: 'tripCount', label: 'จำนวนเที่ยว', inputType: 'number', required: false },
  { key: 'passengerCount', label: 'ผู้โดยสาร (นาย/ราย)', inputType: 'number', required: false },
  // ผู้ประสานงาน — เลือกจากรายชื่อ (เบอร์เติมอัตโนมัติ) หรือ "อื่นๆ" แล้วกรอกชื่อใน coordinator เอง
  { key: 'coordinatorUserId', label: 'ผู้ประสานงาน (ร่วมเดินทางไปในรถ)', inputType: 'user', required: false },
  { key: 'coordinator', label: 'ชื่อผู้ประสานงาน (ระบุ)', inputType: 'text', required: false },
  { key: 'coordinatorPhone', label: 'เบอร์โทรผู้ประสานงาน', inputType: 'tel', required: false },
  { key: 'phone', label: 'เบอร์โทรผู้ขอใช้รถ', inputType: 'tel', required: false },
  { key: 'approverUserId', label: 'ชื่อ ผบ.ชา. ผู้อนุมัติการใช้รถ', inputType: 'user', required: false },
  { key: 'approverName', label: 'ชื่อ ผบ.ชา. (ระบบเติมให้)', inputType: 'text', required: false },
  { key: 'approverPosition', label: 'ตำแหน่ง ผบ.ชา.', inputType: 'text', required: false },
  { key: 'extraDetails', label: 'รายละเอียดเพิ่มเติมที่ให้ปฏิบัติ', inputType: 'textarea', required: false },
  // ผู้จัดทำเอกสาร — เลือกจากรายชื่อ (เบอร์เติมอัตโนมัติ) หรือ "อื่นๆ" แล้วกรอกชื่อใน submitterName เอง
  { key: 'submitterUserId', label: 'ผู้จัดทำเอกสารและประสานงาน', inputType: 'user', required: false },
  { key: 'submitterName', label: 'ชื่อผู้จัดทำเอกสาร (ระบุ)', inputType: 'text', required: false },
  { key: 'submitterPhone', label: 'เบอร์โทรผู้จัดทำเอกสาร', inputType: 'tel', required: false },
  { key: 'submitDate', label: 'วันที่ส่งเอกสาร', inputType: 'date', required: false },
  { key: 'submitTime', label: 'เวลาส่งเอกสาร', inputType: 'time', required: false },
];

// ============================================
// Layout spec
// ============================================

export type LayoutItem =
  | { k: 'text'; v: string; bold?: boolean; underline?: boolean; small?: boolean; size?: number; wrap?: boolean }
  /** ช่องไข่ปลา: w = ความกว้างคงที่ (mm) หรือ flex = ยืดตามพื้นที่ที่เหลือ; ink 'black' = ข้อความพิมพ์ล่วงหน้า */
  | { k: 'dot'; v: string; w?: number; flex?: number; align?: 'left' | 'center'; ink?: 'blue' | 'black' }
  | { k: 'box'; checked: boolean }
  /** ก้อนที่ห้ามแยก/ตัดบรรทัด (เช่น กล่องติ๊ก + ข้อความของ 1 ตัวเลือก) */
  | { k: 'group'; items: LayoutItem[] }
  | { k: 'gap'; w: number };

export interface LayoutRow {
  items: LayoutItem[];
  /** ระยะเว้นบน (mm) */
  mt?: number;
  align?: 'left' | 'center' | 'right';
  /** ย่อหน้าซ้าย (mm) */
  indent?: number;
  /** กระจายรายการให้ชิดซ้าย-ขวาเต็มบรรทัด (ช่องว่างระหว่างรายการยืดเอง) */
  spread?: boolean;
}

export type LayoutBlock =
  | { kind: 'rows'; rows: LayoutRow[] }
  /** สองคอลัมน์ — ratio = สัดส่วนซ้าย:ขวา (ไม่ระบุ = เท่ากัน) */
  | { kind: 'cols'; left: LayoutRow[]; right: LayoutRow[]; mt?: number; signatureAnchor?: 'right'; ratio?: [number, number] }
  | { kind: 'footnote'; v: string };

export interface ThaiDateParts {
  day: string;
  month: string;
  year: string;
}

export interface VehicleLayoutContext {
  data: Record<string, unknown>;
  requestDate: ThaiDateParts;
  requesterName: string;
  requesterPosition: string;
  thaiDate: (value: string) => ThaiDateParts | null;
}

function str(v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  return String(v);
}

const text = (v: string, extra: Partial<Extract<LayoutItem, { k: 'text' }>> = {}): LayoutItem => ({ k: 'text', v, ...extra });
const dot = (v: unknown, o: { w?: number; flex?: number; align?: 'left' | 'center'; ink?: 'blue' | 'black' } = {}): LayoutItem => ({
  k: 'dot',
  v: str(v),
  ...o,
});
const gap = (w: number): LayoutItem => ({ k: 'gap', w });

export const VEHICLE_NOTES = [
  '1. ให้ผู้ขอรถกรอกรายละเอียด และข้อมูลการปฏิบัติต่างๆ ให้ครบทุกช่องโดยละเอียด',
  '2. ผบ.ชา ผู้ลงนามอนุมัติการใช้รถ จะต้องรับผิดชอบในภารกิจตามใบขอใช้รถ และรับรองว่าเป็นภารกิจของ VVIP /ภารกิจของทางราชการ เท่านั้น',
  '3. ให้ หน.เวร/พลขับ ตรวจสอบข้อมูลที่ผู้ขอใช้รถระบุมาโดยละเอียดทุกข้อความ',
];

export const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

/** วันที่ วัน/เดือน(ตัวย่อ)/ปี พ.ศ. จาก 'YYYY-MM-DD' เช่น 10 / พ.ย. / 2569 (ใช้ในช่อง "วดป./ที่ส่งเอกสาร" ที่แคบ) ไม่ถูกต้อง = null */
export function shortThaiDate(iso: string): { day: string; month: string; year: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const monthIndex = Number(m[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return null;
  const y = Number(m[1]);
  return { day: String(Number(m[3])), month: THAI_MONTHS_SHORT[monthIndex], year: String(y > 2500 ? y : y + 543) };
}

export const VEHICLE_FORM_VERSION = 'Update 14 พ.ย.68';

export function buildVehicleLayout(ctx: VehicleLayoutContext): LayoutBlock[] {
  const d = ctx.data;
  const types = Array.isArray(d.vehicleTypes) ? (d.vehicleTypes as string[]) : [];
  const trip = ctx.thaiDate(str(d.tripDate));
  const submit = shortThaiDate(str(d.submitDate));

  const requesterNameText = str(d.requesterName) || ctx.requesterName;
  const departmentText = d.department === OTHER_OPTION ? str(d.departmentOther) : str(d.department);
  const addressToText = d.addressTo === ADDRESS_TO_OTHER ? str(d.addressToOther) : str(d.addressTo);

  const typeItems: LayoutItem[] = [];
  // ตัวเลือกละ 1 ก้อน (กล่อง+ข้อความ) แล้วให้แถว spread: ตัวแรกชิดซ้าย "บรรทุก" ชิดปลายขวาของบรรทัดพอดี
  VEHICLE_TYPE_OPTIONS.forEach((t) => {
    typeItems.push({ k: 'group', items: [{ k: 'box', checked: types.includes(t) }, gap(VEHICLE_TYPE_BOX_GAP_MM), text(t)] });
  });

  const extraLines = str(d.extraDetails).split(/\r?\n/);
  while (extraLines.length < 3) extraLines.push('');

  return [
    {
      kind: 'rows',
      rows: [
        { items: [text('ใบขอรับการสนับสนุนรถยนต์', { bold: true, size: 20 })], align: 'center', mt: 4 },
        { items: [text('(กองพระราชพาหนะ 904 พระที่นั่งอัมพรสถาน)', { bold: true })], align: 'center', mt: 1 },
        { items: [text('ส่วนราชการ'), gap(1), dot(departmentText, { w: 70 })], align: 'right', mt: 8 },
        {
          items: [
            text('วันที่'), gap(1), dot(ctx.requestDate.day, { w: 14 }), gap(1),
            text('เดือน'), gap(1), dot(ctx.requestDate.month, { w: 28 }), gap(1),
            text('พ.ศ.'), gap(1), dot(ctx.requestDate.year, { w: 18 }),
          ],
          align: 'right',
          mt: 1,
        },
        { items: [text('ถึง บก.ปล่อยรถ'), gap(1), dot(addressToText, { w: 80 })], mt: 5 },
        { items: [text('** ข้าราชการเท่านั้น**', { small: true })], align: 'right', mt: 2 },
        {
          items: [
            text('ด้วย ข้าพเจ้า'), gap(1), dot(requesterNameText, { flex: 1 }), gap(4),
            text('ตำแหน่ง'), gap(1), dot(str(d.requesterPosition) || ctx.requesterPosition, { flex: 1 }),
          ],
          indent: 12,
        },
        {
          items: [
            text('สังกัด ส่วนราชการ/ฝ่าย'), gap(1), dot(d.affiliation, { flex: 1 }), gap(4),
            text('แผนก'), gap(1), dot(d.section, { flex: 1 }),
          ],
          mt: 1,
        },
        {
          items: [
            text('กอง'), gap(1), dot(d.division, { flex: 1 }), gap(4),
            text('กรม'), gap(1), dot(d.bureau, { flex: 1 }),
          ],
          mt: 1,
        },
        {
          items: [
            text('มีความประสงค์ขอใช้รถยนต์ จำนวน', { bold: true }), gap(1), dot(d.vehicleCount, { w: 22 }), gap(1),
            text('คัน ตามประเภทรถ ดังนี้', { bold: true }),
          ],
          mt: 3,
        },
        { items: typeItems, mt: 2, spread: true },
        {
          items: [
            { k: 'box', checked: types.includes(VEHICLE_TYPE_OTHER) }, gap(1.5), text(VEHICLE_TYPE_OTHER), gap(1),
            dot(types.includes(VEHICLE_TYPE_OTHER) ? d.vehicleOther : '', { flex: 1 }),
          ],
          mt: 1,
        },
        { items: [text('สำหรับภารกิจ', { bold: true }), gap(2), dot(d.purpose, { flex: 1 })], mt: 3 },
        { items: [text('ตำบลต้นทาง'), gap(2), dot(d.originPlace, { flex: 1 })], mt: 1 },
        { items: [text('ตำบลระหว่างทาง'), gap(2), dot(d.viaPlace, { flex: 1 })], mt: 1 },
        { items: [text('ตำบลปลายทาง'), gap(2), dot(d.destination, { flex: 1 })], mt: 1 },
        {
          items: [
            text('ในวันที่'), gap(1), dot(trip?.day, { w: 12 }), gap(1),
            text('เดือน'), gap(1), dot(trip?.month, { w: 26 }), gap(1),
            text('พ.ศ.'), gap(1), dot(trip?.year, { w: 16 }), gap(2),
            text('เวลา'), gap(1), dot(d.departTime, { w: 16 }), gap(1),
            text('น. จำนวน'), gap(1), dot(d.tripCount, { w: 10 }), gap(1),
            text('เที่ยว ผู้โดยสาร'), gap(1), dot(d.passengerCount, { w: 14 }), gap(1),
            text('นาย/ราย'),
          ],
          mt: 1,
        },
        {
          items: [
            text('ผู้ประสานงาน (ร่วมเดินทางไปในรถ)'), gap(2), dot(d.coordinator, { flex: 1 }), gap(3),
            text('โทร'), gap(1), dot(d.coordinatorPhone, { w: 32 }),
          ],
          mt: 3,
        },
      ],
    },
    {
      kind: 'cols',
      mt: 6,
      left: [
        { items: [text('ลงนาม'), gap(1), dot('', { flex: 1 }), gap(1), text('ผู้ขอใช้รถ')] },
        { items: [gap(12), text('('), dot(requesterNameText, { w: 60 }), text(')')], mt: 1 },
        { items: [text('เบอร์โทร'), gap(1), dot(d.phone, { w: 60 })], mt: 1 },
      ],
      right: [
        { items: [text('ลงนาม'), gap(1), dot('', { flex: 1 }), gap(1), text('ผบ.ชา อนุมัติการใช้รถ')] },
        { items: [gap(10), text('('), dot(d.approverName, { w: 48 }), text(')')], mt: 1 },
        { items: [text('ตำแหน่ง'), gap(1), dot(d.approverPosition, { w: 55 })], mt: 1 },
      ],
    },
    {
      kind: 'rows',
      rows: [
        { items: [text('รายละเอียดเพิ่มเติมที่ให้ปฏิบัติ (ระบุข้อมูลให้ชัดเจน)', { bold: true, underline: true })], mt: 5 },
        ...extraLines.map((line, i): LayoutRow => ({ items: [dot(line, { flex: 1, align: 'left' })], mt: i === 0 ? 2 : 1 })),
      ],
    },
    {
      kind: 'cols',
      mt: 4,
      // ลายเซ็นผู้จัดทำเอกสารวางทับเส้น "ลงชื่อ" ของคอลัมน์ขวา; สัดส่วนซ้าย(หมายเหตุ):ขวา(ลงชื่อ) ตามฟอร์มต้นแบบ
      signatureAnchor: 'right',
      ratio: [11, 9],
      left: [
        { items: [text('หมายเหตุ', { bold: true, underline: true, small: true })] },
        ...VEHICLE_NOTES.map((n): LayoutRow => ({ items: [text(n, { small: true, wrap: true })], indent: 3 })),
      ],
      right: [
        { items: [text('ลงชื่อ'), gap(1), dot('', { flex: 1 }), gap(1), text('ผู้จัดทำเอกสาร', { small: true })] },
        { items: [gap(8), text('('), dot(d.submitterName, { w: 55 }), text(')'), gap(1), text('และประสานงาน', { small: true })], mt: 1 },
        { items: [text('เบอร์โทร'), gap(1), dot(d.submitterPhone, { w: 48 })], mt: 1 },
        {
          items: [
            text('วดป./ที่ส่งเอกสาร', { small: true }), gap(1), dot(submit?.day, { w: 7 }), text('/'),
            dot(submit?.month, { w: 10 }), text('/'), dot(submit?.year, { w: 11 }), gap(1),
            text('เวลา', { small: true }), gap(1), dot(d.submitTime, { w: 12 }), gap(1), text('น.', { small: true }),
          ],
          mt: 1,
        },
      ],
    },
    { kind: 'footnote', v: VEHICLE_FORM_VERSION },
  ];
}

/**
 * ใส่/ซ่อนลายเซ็นผู้จัดทำเอกสารได้หรือไม่: ชื่อผู้จัดทำในใบต้องเป็นผู้ใช้ที่ล็อกอินอยู่เอง
 * (ลายเซ็นคือการรับรองด้วยตนเอง — เลือกคนอื่น/"อื่นๆ" จะไม่มีสิทธิ์)
 */
export function canPlaceSubmitterSignature(data: Record<string, unknown>, currentUserId: number): boolean {
  const id = data.submitterUserId;
  return id !== null && id !== undefined && Number(id) === currentUserId;
}
