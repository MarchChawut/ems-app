/**
 * ==================================================
 * Utility Functions - ฟังก์ชันอเนกประสงค์
 * ==================================================
 * ไฟล์นี้รวมฟังก์ชันช่วยเหลือต่างๆ ที่ใช้ทั่วไปในแอปพลิเคชัน
 */

import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * ฟังก์ชันสำหรับรวม class names ด้วย tailwind-merge
 * ใช้สำหรับจัดการ Tailwind CSS classes ที่อาจซ้ำกัน
 * 
 * @param inputs - class names ที่ต้องการรวม
 * @returns {string} class names ที่รวมกันแล้ว
 * 
 * ตัวอย่างการใช้งาน:
 * cn('px-4 py-2', 'bg-blue-500', className)
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * ฟังก์ชันสำหรับแปลงปี ค.ศ. เป็น พ.ศ. อย่างปลอดภัย (ป้องกันบวกซ้ำ)
 * @param year - ปีที่ต้องการแปลง
 * @returns {number} ปี พ.ศ.
 *
 * ตัวอย่างการใช้งาน:
 * toBuddhistYear(2025) // 2568
 * toBuddhistYear(2568) // 2568 (ไม่บวกซ้ำ)
 */
export function toBuddhistYear(year: number): number {
  // ถ้าปีมากกว่า 2500 แสดงว่าเป็น พ.ศ. อยู่แล้ว ไม่ต้องบวก
  return year > 2500 ? year : year + 543;
}

/**
 * ดึงปี ค.ศ. จาก Date อย่างปลอดภัย (ถ้าเป็น พ.ศ. ให้แปลงกลับ)
 * @param date - วันที่ที่ต้องการดึงปี
 * @returns {number} ปี ค.ศ.
 *
 * ตัวอย่างการใช้งาน:
 * safeGetGregorianYear(new Date('2568-01-15')) // 2025
 * safeGetGregorianYear(new Date('2025-01-15')) // 2025
 */
export function safeGetGregorianYear(date: Date): number {
  const y = date.getFullYear();
  // ถ้า > 2500 แสดงว่าเป็น พ.ศ. ต้องลบ 543 กลับ
  return y > 2500 ? y - 543 : y;
}

/**
 * แปลงสตริงวันที่ (YYYY-MM-DD) เป็น Date ที่ปีเป็น ค.ศ. เสมอ
 * ป้องกันกรณี input ส่งปี พ.ศ. มาผิดๆ (เช่น native date picker บน locale ไทย)
 * @param dateStr - วันที่รูปแบบ YYYY-MM-DD
 * @returns {Date} วันที่ที่ปีถูกแก้เป็น ค.ศ. แล้ว
 *
 * ตัวอย่างการใช้งาน:
 * toSafeGregorianDate('2569-07-07') // Date ปี 2026
 * toSafeGregorianDate('2026-07-07') // Date ปี 2026 (ไม่เปลี่ยนแปลง)
 */
export function toSafeGregorianDate(dateStr: string): Date {
  const d = new Date(dateStr);
  const correctedYear = safeGetGregorianYear(d);
  if (correctedYear !== d.getFullYear()) {
    d.setFullYear(correctedYear);
  }
  return d;
}

/**
 * คำนวณเวลาแจ้งเตือนอัตโนมัติ 2 รอบจากวันที่ของ reminderAt (ใช้เฉพาะวันที่ ไม่สนเวลาที่ตั้งไว้)
 * - dayBeforeAt: วันก่อนหน้า 1 วัน เวลา 19:00
 * - onDayAt: วันเดียวกัน เวลา 08:00
 * @param reminderAt - วัน/เวลาแจ้งเตือนที่ผู้ใช้ตั้งไว้
 *
 * ตัวอย่างการใช้งาน:
 * computeTaskReminderSchedule(new Date('2026-07-22T12:40')) // { dayBeforeAt: 21 ก.ค. 19:00, onDayAt: 22 ก.ค. 08:00 }
 */
export function computeTaskReminderSchedule(reminderAt: Date): { dayBeforeAt: Date; onDayAt: Date } {
  const due = new Date(reminderAt);
  due.setHours(0, 0, 0, 0);

  const dayBeforeAt = new Date(due);
  dayBeforeAt.setDate(dayBeforeAt.getDate() - 1);
  dayBeforeAt.setHours(19, 0, 0, 0);

  const onDayAt = new Date(due);
  onDayAt.setHours(8, 0, 0, 0);

  return { dayBeforeAt, onDayAt };
}

/**
 * ฟังก์ชันสำหรับจัดรูปแบบวันที่
 * @param date - วันที่ที่ต้องการจัดรูปแบบ
 * @param options - ตัวเลือกการจัดรูปแบบ
 * @returns {string} วันที่ในรูปแบบที่กำหนด
 * 
 * ตัวอย่างการใช้งาน:
 * formatDate(new Date()) // "4 ก.พ. 2567"
 * formatDate(new Date(), { year: 'numeric', month: 'long', day: 'numeric' }) // "4 กุมภาพันธ์ 2567"
 */
export function formatDate(
  date: Date | string | number,
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }
): string {
  const d = new Date(date);

  // ตรวจสอบว่าวันที่ถูกต้องหรือไม่
  if (isNaN(d.getTime())) {
    return 'ไม่ระบุ';
  }

  // ป้องกันบวก พ.ศ. ซ้ำ กรณีปีใน DB เป็น พ.ศ. อยู่แล้ว (legacy data)
  const correctedYear = safeGetGregorianYear(d);
  if (correctedYear !== d.getFullYear()) {
    d.setFullYear(correctedYear);
  }

  return d.toLocaleDateString('th-TH', options);
}

/**
 * ฟังก์ชันสำหรับจัดรูปแบบเวลา
 * @param date - วันที่ที่ต้องการจัดรูปแบบ
 * @returns {string} เวลาในรูปแบบ HH:MM
 * 
 * ตัวอย่างการใช้งาน:
 * formatTime(new Date()) // "14:30"
 */
export function formatTime(date: Date | string | number): string {
  const d = new Date(date);
  
  if (isNaN(d.getTime())) {
    return '--:--';
  }
  
  return d.toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * ฟังก์ชันสำหรับจัดรูปแบบวันที่และเวลา
 * @param date - วันที่ที่ต้องการจัดรูปแบบ
 * @returns {string} วันที่และเวลา
 * 
 * ตัวอย่างการใช้งาน:
 * formatDateTime(new Date()) // "4 ก.พ. 2567 14:30"
 */
export function formatDateTime(date: Date | string | number): string {
  return `${formatDate(date)} ${formatTime(date)}`;
}

/**
 * ฟังก์ชันสำหรับคำนวณจำนวนวันระหว่างสองวันที่
 * @param startDate - วันที่เริ่มต้น
 * @param endDate - วันที่สิ้นสุด
 * @returns {number} จำนวนวัน
 * 
 * ตัวอย่างการใช้งาน:
 * calculateDays('2024-02-01', '2024-02-05') // 4
 */
export function calculateDays(startDate: Date | string, endDate: Date | string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  const diffTime = Math.abs(end.getTime() - start.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays;
}

/**
 * ฟังก์ชันสำหรับหน่วงเวลา (delay)
 * @param ms - จำนวนมิลลิวินาที
 * @returns {Promise<void>}
 * 
 * ตัวอย่างการใช้งาน:
 * await delay(1000); // รอ 1 วินาที
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * ฟังก์ชันสำหรับตัดข้อความให้สั้นลง
 * @param text - ข้อความที่ต้องการตัด
 * @param maxLength - ความยาวสูงสุด
 * @param suffix - ข้อความต่อท้าย (default: '...')
 * @returns {string} ข้อความที่ตัดแล้ว
 * 
 * ตัวอย่างการใช้งาน:
 * truncate('This is a long text', 10) // "This is..."
 */
export function truncate(text: string, maxLength: number, suffix: string = '...'): string {
  if (!text || text.length <= maxLength) {
    return text;
  }
  
  return text.substring(0, maxLength - suffix.length) + suffix;
}

/**
 * ฟังก์ชันสำหรับแปลงตัวเลขให้มี comma คั่น
 * @param num - ตัวเลขที่ต้องการแปลง
 * @returns {string} ตัวเลขที่มี comma คั่น
 * 
 * ตัวอย่างการใช้งาน:
 * formatNumber(1000000) // "1,000,000"
 */
export function formatNumber(num: number): string {
  return num.toLocaleString('th-TH');
}

/**
 * ฟังก์ชันสำหรับตรวจสอบว่าอีเมลถูกต้องหรือไม่
 * @param email - อีเมลที่ต้องการตรวจสอบ
 * @returns {boolean} true หากอีเมลถูกต้อง
 * 
 * ตัวอย่างการใช้งาน:
 * isValidEmail('test@example.com') // true
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * ฟังก์ชันสำหรับสร้าง slug จากข้อความ
 * @param text - ข้อความที่ต้องการแปลง
 * @returns {string} slug ที่สร้างขึ้น
 * 
 * ตัวอย่างการใช้งาน:
 * slugify('Hello World') // "hello-world"
 */
export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')       // แทนที่ช่องว่างด้วย -
    .replace(/[^\w\-]+/g, '')   // ลบอักขระพิเศษ
    .replace(/\-\-+/g, '-');    // แทนที่ multiple - ด้วย single -
}

/**
 * ฟังก์ชันสำหรับสร้าง UUID v4
 * @returns {string} UUID ที่สร้างขึ้น
 * 
 * ตัวอย่างการใช้งาน:
 * generateUUID() // "f47ac10b-58cc-4372-a567-0e02b2c3d479"
 */
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * ฟังก์ชันสำหรับตรวจสอบว่าอยู่ใน environment ของ browser หรือไม่
 * @returns {boolean} true หากอยู่ใน browser
 */
export function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

/**
 * ฟังก์ชันสำหรับตรวจสอบว่าอยู่ใน environment ของ server หรือไม่
 * @returns {boolean} true หากอยู่ใน server
 */
export function isServer(): boolean {
  return typeof window === 'undefined';
}

/**
 * รายการ prefix พลเรือน (Civilian)
 * - prefix กลุ่มนี้จะไม่ปรากฏหลังคำว่า "ลงชื่อ" แต่จะติดไปกับชื่อในวงเล็บเท่านั้น
 */
export const CIVILIAN_PREFIXES: readonly string[] = [
  'นาย',
  'นาง',
  'นางสาว',
  'น.ส.',
  'เด็กชาย',
  'เด็กหญิง',
] as const;

/**
 * ตรวจสอบว่า prefix นี้เป็นยศทหาร/ตำรวจ (หรือยศที่ไม่ใช่พลเรือน) หรือไม่
 * @param prefix - คำนำหน้าชื่อ
 * @returns {boolean} true หากเป็นยศทหาร/ตำรวจ/ราชทินนาม (non-civilian)
 */
export function isMilitaryPrefix(prefix?: string | null): boolean {
  if (!prefix) return false;
  const trimmed = prefix.trim();
  if (!trimmed) return false;
  return !CIVILIAN_PREFIXES.includes(trimmed);
}

/**
 * จัดรูปแบบชื่อสำหรับบล็อกลายเซ็นตามกฎ:
 * - พลเรือน (นาย/นาง/นางสาว/น.ส./เด็กชาย/เด็กหญิง):
 *   prefix ติดกับ name ในวงเล็บ, บรรทัด "ลงชื่อ" ไม่มี prefix
 * - ยศทหาร/ตำรวจ (ร.ท., พ.อ., ฯลฯ):
 *   prefix ตามหลังคำว่า "ลงชื่อ" เท่านั้น ในวงเล็บแสดงเฉพาะชื่อ (ไม่ซ้ำ prefix)
 *
 * @param prefix - คำนำหน้าชื่อ (เช่น "นาย", "ร.ท.", "พ.อ.")
 * @param name - ชื่อ-นามสกุล
 * @returns { linePrefix, parenName } สำหรับใช้ในบล็อกลายเซ็น
 *
 * ตัวอย่าง:
 * formatSignatureName('ร.ท.', 'สมศักดิ์ ใจดี')
 *   // { linePrefix: 'ร.ท.', parenName: 'สมศักดิ์ ใจดี' }
 * formatSignatureName('นาย', 'สมชาย ใจดี')
 *   // { linePrefix: '', parenName: 'นายสมชาย ใจดี' }
 */
export function formatSignatureName(
  prefix?: string | null,
  name?: string | null
): { linePrefix: string; parenName: string } {
  const safePrefix = (prefix ?? '').trim();
  const safeName = (name ?? '').trim();
  const military = isMilitaryPrefix(safePrefix);

  return {
    linePrefix: military ? safePrefix : '',
    parenName: military ? safeName : `${safePrefix}${safeName}`,
  };
}
