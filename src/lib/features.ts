/**
 * ==================================================
 * Features - ทะเบียนฟีเจอร์ของระบบ (เปิด/ปิด + ค่าเริ่มต้นต่อฟีเจอร์)
 * ==================================================
 * ไฟล์ pure (ไม่ import prisma/next) ใช้ได้ทั้ง server, client และ script
 * แต่ละหน่วยงานที่ติดตั้งระบบนี้เลือกเปิด/ปิดฟีเจอร์ได้จากหน้าตั้งค่าแอดมิน (หน้า "ฟีเจอร์ของระบบ")
 * ไม่มีแถวในฐานข้อมูล = ค่าเริ่มต้นในไฟล์นี้ (ทุกฟีเจอร์เปิด) จึงไม่เปลี่ยนพฤติกรรมเดิมจนกว่าแอดมินจะแก้
 *
 * เพิ่มฟีเจอร์/ช่องตั้งค่าใหม่: เพิ่มรายการใน FEATURES (1 บล็อกต่อฟีเจอร์) — หน้าการ์ด การตรวจ API/หน้า และเมนูจะตามเอง
 */

import { z } from 'zod';
import { normalizeRequestPath } from './path-normalize';

export type FeatureId =
  | 'leaves'
  | 'roster'
  | 'documents'
  | 'forms'
  | 'supplies'
  | 'assets'
  | 'tasks'
  | 'notifications';

export interface FeatureOption {
  key: string;
  label: string;
  description?: string;
  /** ค่าเริ่มต้นของตัวเลือกย่อย (boolean) */
  default: boolean;
}

export type FeatureConfigField =
  | { key: string; label: string; description?: string; type: 'time'; default: string }
  | { key: string; label: string; description?: string; type: 'number'; default: number; min: number; max: number };

export interface FeatureDef {
  id: FeatureId;
  category: FeatureCategoryId;
  label: string;
  description: string;
  /** ชื่อไอคอน lucide-react (หน้าการ์ดแปลงเป็นไอคอนจริง) */
  icon: string;
  /** prefix ของหน้า (path) ที่เป็นของฟีเจอร์นี้ */
  pagePrefixes: string[];
  /** prefix ของ API ที่เป็นของฟีเจอร์นี้ — requireAuth ตอบ 403 ถ้าฟีเจอร์ปิด */
  apiPrefixes: string[];
  /** ข้อความเตือนผลกระทบเมื่อปิด */
  dependents: string[];
  /** ตัวเลือกย่อย (เปิด/ปิดเฉพาะส่วนของฟีเจอร์) */
  options?: FeatureOption[];
  /** ช่องค่าเริ่มต้นที่ตั้งได้ */
  config?: FeatureConfigField[];
  /** ลิงก์ไปหน้าตั้งค่าเพิ่มเติมของฟีเจอร์นี้ (ถ้ามี) */
  settingsHref?: string;
}

export type FeatureCategoryId = 'hr' | 'documents' | 'inventory' | 'work' | 'overview';

export const FEATURE_CATEGORIES: { id: FeatureCategoryId; label: string; description: string }[] = [
  { id: 'hr', label: 'งานบุคคล', description: 'การลาและตารางเวร' },
  { id: 'documents', label: 'งานเอกสาร', description: 'หนังสือเข้า-ออกและแบบฟอร์ม' },
  { id: 'inventory', label: 'พัสดุและครุภัณฑ์', description: 'วัสดุสิ้นเปลืองและครุภัณฑ์' },
  { id: 'work', label: 'ติดตามงาน', description: 'งานที่มอบหมายและโฟลเดอร์งาน' },
  { id: 'overview', label: 'แจ้งเตือน', description: 'การแจ้งเตือนผ่าน LINE' },
];

export const FEATURES: FeatureDef[] = [
  {
    id: 'leaves',
    category: 'hr',
    label: 'การลา',
    description: 'ใบลาทุกประเภท การอนุมัติหลายขั้น ปฏิทินวันหยุด และกฎการคำนวณวันลา',
    icon: 'Calendar',
    pagePrefixes: ['/dashboard/leaves'],
    apiPrefixes: ['/api/leaves', '/api/leave-rules', '/api/holidays'],
    dependents: ['วิดเจ็ตการลาในหน้าหลัก', 'การแจ้งเตือนขั้นตอนใบลาทาง LINE', 'ตัวแก้กฎการลาในหน้าตั้งค่า'],
    options: [
      { key: 'lateArrival', label: 'ใบขออนุญาตมาสาย', default: true },
      { key: 'earlyLeave', label: 'ใบขออนุญาตออกก่อนเวลา', default: true },
    ],
    config: [
      { key: 'lateArrivalFixedTime', label: 'เวลาเข้างานที่ใช้คำนวณมาสาย', description: 'ใช้ในใบมาสาย (ต้องมาถึงหลังเวลานี้)', type: 'time', default: '08:30' },
      { key: 'workStartTime', label: 'เวลาเริ่มงาน (กฎการลาใหม่)', description: 'ค่าเริ่มต้นตอนสร้างกฎการลา', type: 'time', default: '08:30' },
      { key: 'workEndTime', label: 'เวลาเลิกงาน (กฎการลาใหม่)', description: 'ค่าเริ่มต้นตอนสร้างกฎการลา', type: 'time', default: '16:30' },
    ],
  },
  {
    id: 'roster',
    category: 'hr',
    label: 'ตารางเวรประจำกอง',
    description: 'ตารางเวร/ปฏิบัติงานนอกสถานที่ของกอง',
    icon: 'CalendarDays',
    pagePrefixes: ['/dashboard/roster'],
    apiPrefixes: ['/api/roster'],
    dependents: ['วิดเจ็ตตารางเวรในหน้าหลัก'],
  },
  {
    id: 'documents',
    category: 'documents',
    label: 'หนังสือเข้า-ออก',
    description: 'ทะเบียนหนังสือรับ-ส่ง พร้อมแนบไฟล์และส่งออก Excel',
    icon: 'Inbox',
    pagePrefixes: ['/dashboard/documents'],
    apiPrefixes: ['/api/documents', '/api/uploads/document'],
    dependents: [],
  },
  {
    id: 'forms',
    category: 'documents',
    label: 'แบบฟอร์ม',
    description: 'แบบฟอร์มขอเอกสารภายใน (ขอรถยนต์ ห้องประชุม ฯลฯ) และตัวสร้างแบบฟอร์ม',
    icon: 'FileSignature',
    pagePrefixes: ['/dashboard/forms', '/dashboard/settings/form-builder'],
    apiPrefixes: ['/api/form-requests', '/api/form-templates'],
    dependents: ['ตัวสร้างแบบฟอร์มในหน้าตั้งค่า'],
    settingsHref: '/dashboard/settings/form-builder',
  },
  {
    id: 'supplies',
    category: 'inventory',
    label: 'วัสดุ',
    description: 'สต็อกวัสดุสิ้นเปลือง รับ-จ่าย ประวัติ และส่งออก Excel',
    icon: 'Package',
    pagePrefixes: ['/dashboard/supplies'],
    apiPrefixes: ['/api/supplies', '/api/supply-categories', '/api/supply-transactions'],
    dependents: ['วิดเจ็ตวัสดุใกล้หมดในหน้าหลัก'],
  },
  {
    id: 'assets',
    category: 'inventory',
    label: 'ครุภัณฑ์',
    description: 'ทะเบียนครุภัณฑ์ การยืม-คืน และส่งออก Excel',
    icon: 'Monitor',
    pagePrefixes: ['/dashboard/assets'],
    apiPrefixes: ['/api/assets', '/api/asset-categories', '/api/asset-checkouts'],
    dependents: ['วิดเจ็ตสถานะครุภัณฑ์ในหน้าหลัก'],
  },
  {
    id: 'tasks',
    category: 'work',
    label: 'ติดตามงาน',
    description: 'กระดานงาน (Kanban) การมอบหมาย โฟลเดอร์งาน และการเตือนงาน',
    icon: 'CheckCircle',
    pagePrefixes: ['/dashboard/tasks'],
    apiPrefixes: ['/api/tasks', '/api/columns', '/api/task-folders'],
    dependents: ['วิดเจ็ตงานล่าสุดในหน้าหลัก', 'การเตือนงานตามเวลา (cron/LINE)'],
  },
  {
    id: 'notifications',
    category: 'overview',
    label: 'แจ้งเตือนทาง LINE',
    description: 'ส่งข้อความเข้ากลุ่ม LINE (ต้องตั้งค่า LINE_CHANNEL_ACCESS_TOKEN / LINE_GROUP_ID ในเซิร์ฟเวอร์)',
    icon: 'Bell',
    pagePrefixes: [],
    apiPrefixes: ['/api/line'],
    dependents: [],
    options: [
      { key: 'taskReminders', label: 'เตือนงานตามเวลา', description: 'cron เตือนงานล่วงหน้า/ถึงกำหนด', default: true },
      { key: 'leaveNotifications', label: 'แจ้งขั้นตอนใบลา', description: 'แจ้งเมื่อมีการยื่น/อนุมัติใบลา', default: true },
    ],
  },
];

/** ฟีเจอร์เสริมที่ "ปิด" ในการติดตั้งใหม่ (seed) — ทุกฟีเจอร์ยกเว้นการแจ้งเตือน LINE (ล้มเหลวเงียบเมื่อไม่ตั้ง env) */
export const FRESH_INSTALL_DISABLED_FEATURES: FeatureId[] = FEATURES.filter((f) => f.id !== 'notifications').map((f) => f.id);

/** ฟีเจอร์หลัก — ปิดไม่ได้ (แสดงเป็นการ์ดล็อกในหน้าตั้งค่า) */
export const CORE_FEATURES: { label: string; description: string; icon: string }[] = [
  { label: 'หน้าหลัก (ภาพรวม)', description: 'สรุปภาพรวมของฟีเจอร์ที่เปิดอยู่ — แท็บเริ่มต้นของระบบ', icon: 'Layout' },
  { label: 'พนักงานและบัญชีผู้ใช้', description: 'ทะเบียนพนักงาน ตำแหน่ง สิทธิ์ — ทุกฟีเจอร์อ้างอิงข้อมูลนี้', icon: 'Users' },
  { label: 'ข้อมูลส่วนตัวและลายเซ็น', description: 'โปรไฟล์ผู้ใช้และรูปลายเซ็นที่ใช้ในเอกสาร', icon: 'UserCircle' },
  { label: 'ความปลอดภัยของบัญชี', description: 'รหัสผ่าน passkey และการยืนยันตัวตนสองชั้น', icon: 'ShieldCheck' },
  { label: 'ตั้งค่าระบบ', description: 'หน้านี้ ข้อมูลหน่วยงาน และสิทธิ์การใช้งาน', icon: 'Settings' },
];

// ============================================
// ค่าที่ resolve แล้ว (ผสมแถวจาก DB กับค่าเริ่มต้น)
// ============================================

export interface FeatureRow {
  featureKey: string;
  enabled: boolean;
  options?: unknown;
  config?: unknown;
}

export interface ResolvedFeature {
  id: FeatureId;
  enabled: boolean;
  options: Record<string, boolean>;
  config: Record<string, string | number>;
}

export type FeatureMap = Record<FeatureId, ResolvedFeature>;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

/** ผสมแถวจาก DB กับค่าเริ่มต้น: ไม่มีแถว = เปิด + ค่าเริ่มต้นทั้งหมด; ค่าที่เก็บไว้แต่ผิดชนิด/ไม่รู้จักถูกข้ามกลับไปใช้ค่าเริ่มต้น */
export function resolveFeatures(rows: FeatureRow[] = []): FeatureMap {
  const byKey = new Map(rows.map((r) => [r.featureKey, r]));
  const map = {} as FeatureMap;
  for (const f of FEATURES) {
    const row = byKey.get(f.id);
    const storedOptions = row && isRecord(row.options) ? row.options : {};
    const storedConfig = row && isRecord(row.config) ? row.config : {};
    const options: Record<string, boolean> = {};
    for (const o of f.options ?? []) {
      const v = storedOptions[o.key];
      options[o.key] = typeof v === 'boolean' ? v : o.default;
    }
    const config: Record<string, string | number> = {};
    for (const c of f.config ?? []) {
      const v = storedConfig[c.key];
      if (c.type === 'time') config[c.key] = typeof v === 'string' && TIME_REGEX.test(v) ? v : c.default;
      else config[c.key] = typeof v === 'number' && Number.isFinite(v) && v >= c.min && v <= c.max ? v : c.default;
    }
    map[f.id] = { id: f.id, enabled: row ? row.enabled : true, options, config };
  }
  return map;
}

export function isFeatureOn(map: FeatureMap, id: FeatureId): boolean {
  return map[id]?.enabled ?? true;
}

/** ตัวเลือกย่อยเปิดอยู่ไหม (ฟีเจอร์แม่ต้องเปิดด้วย) */
export function isOptionOn(map: FeatureMap, id: FeatureId, option: string): boolean {
  const f = map[id];
  return !!f && f.enabled && f.options[option] === true;
}

// ============================================
// path → ฟีเจอร์
// ============================================

/** path ที่ต้องลองเทียบ: ดิบ (พิมพ์เล็ก) + normalize แล้ว (ถ้าได้) */
function pathCandidates(pathname: string): string[] {
  const normalized = normalizeRequestPath(pathname, { lowercase: true });
  const raw = pathname.toLowerCase();
  return normalized && normalized !== raw ? [raw, normalized] : [raw];
}

function matchPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + '/');
}

/** ฟีเจอร์ที่เป็นเจ้าของ API path นี้ (ไม่ใช่ฟีเจอร์ที่ปิดได้ = undefined — เช่น /api/users, /api/auth) */
export function featureForApiPath(pathname: string): FeatureId | undefined {
  // เทียบทั้ง path ดิบและ path ที่ normalize แล้ว (decode/รวม slash/แก้ dot-segment/ตัวพิมพ์เล็ก) — กันหลบด้วย /api/%6Ceaves,
  // /api//leaves, /api/x/../leaves ฯลฯ ขณะที่ router ยังจับคู่เป็น route จริง; เป็น deny-list จึงให้ตรงด้านใดด้านหนึ่งก็ถือว่าตรง
  for (const candidate of pathCandidates(pathname)) {
    const hit = FEATURES.find((f) => f.apiPrefixes.some((p) => matchPrefix(candidate, p)))?.id;
    if (hit) return hit;
  }
  return undefined;
}

/** ฟีเจอร์ที่เป็นเจ้าของหน้านี้ — เลือก prefix ที่ยาวที่สุด (หน้าหลัก/พนักงาน/โปรไฟล์/ตั้งค่าเป็นฟีเจอร์หลัก ไม่มีเจ้าของ) */
export function featureForPagePath(pathname: string): FeatureId | undefined {
  let best: { id: FeatureId; len: number } | undefined;
  for (const candidate of pathCandidates(pathname)) {
    for (const f of FEATURES) {
      for (const p of f.pagePrefixes) {
        if (matchPrefix(candidate, p) && (!best || p.length > best.len)) best = { id: f.id, len: p.length };
      }
    }
  }
  return best?.id;
}

// ============================================
// หน้าแรกที่ยังเปิดอยู่
// ============================================

const LANDING_ORDER: { id: FeatureId; href: string; employee: boolean }[] = [
  { id: 'tasks', href: '/dashboard/tasks', employee: true },
  { id: 'leaves', href: '/dashboard/leaves', employee: true },
  { id: 'roster', href: '/dashboard/roster', employee: true },
  { id: 'forms', href: '/dashboard/forms', employee: true },
];

/**
 * หน้าแรกที่ผู้ใช้เข้าได้ — หน้าหลัก (ฟีเจอร์หลัก เปิดเสมอ) สำหรับผู้ที่ไม่ใช่ EMPLOYEE;
 * EMPLOYEE (ไม่เห็นหน้าหลัก) ไปฟีเจอร์แรกที่เปิดอยู่ ไม่มีเลย → โปรไฟล์ (ฟีเจอร์หลัก เปิดเสมอ)
 */
export function landingPath(map: FeatureMap, role: string): string {
  if (role !== 'EMPLOYEE') return '/dashboard';
  const hit = LANDING_ORDER.find((l) => isFeatureOn(map, l.id) && l.employee);
  return hit ? hit.href : '/dashboard/profile';
}

/** เปิด/ปิดฟีเจอร์ได้เฉพาะ Super Admin (ไม่ใช่ ADMIN ธรรมดา และให้สิทธิ์ผ่านหน้าสิทธิ์ไม่ได้) */
export function canManageFeatures(role: string | undefined | null): boolean {
  return role === 'SUPER_ADMIN';
}

// ============================================
// ตรวจ body ของ PATCH /api/feature-settings
// ============================================

export const featurePatchSchema = z.object({
  featureKey: z.string().min(1).max(50),
  enabled: z.boolean().optional(),
  options: z.record(z.string(), z.boolean()).optional(),
  config: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
});

export type FeaturePatch = z.infer<typeof featurePatchSchema>;

/** ตรวจ patch กับ registry: คีย์ฟีเจอร์/ตัวเลือก/ช่อง config ต้องมีจริง และค่าต้องถูกชนิด/ช่วง — คืนข้อความผิดพลาดหรือ null */
export function validateFeaturePatch(patch: FeaturePatch): string | null {
  const def = FEATURES.find((f) => f.id === patch.featureKey);
  if (!def) return 'ไม่พบฟีเจอร์นี้ (หรือเป็นฟีเจอร์หลักที่ปิดไม่ได้)';
  for (const [k, v] of Object.entries(patch.options ?? {})) {
    if (!(def.options ?? []).some((o) => o.key === k) || typeof v !== 'boolean') return `ตัวเลือก "${k}" ไม่ถูกต้อง`;
  }
  for (const [k, v] of Object.entries(patch.config ?? {})) {
    const field = (def.config ?? []).find((c) => c.key === k);
    if (!field) return `ช่องตั้งค่า "${k}" ไม่ถูกต้อง`;
    if (field.type === 'time' && !(typeof v === 'string' && TIME_REGEX.test(v))) return `"${field.label}" ต้องเป็นเวลารูปแบบ HH:mm`;
    if (field.type === 'number' && !(typeof v === 'number' && Number.isFinite(v) && v >= field.min && v <= field.max)) {
      return `"${field.label}" ต้องอยู่ระหว่าง ${field.min} ถึง ${field.max}`;
    }
  }
  return null;
}
