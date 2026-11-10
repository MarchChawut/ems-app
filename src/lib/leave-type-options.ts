/**
 * ใบมาสาย/ใบออกก่อนเวลาที่แอดมินปิดไว้ (ตั้งค่า > ฟีเจอร์ของระบบ > การลา) — ตรวจทั้งตอนสร้างและตอนแก้ไขประเภท
 * ไม่ import prisma (ใช้ได้ทั้ง route และ unit test)
 */

import { isOptionOn, type FeatureMap } from './features';

/** ข้อความผิดพลาดถ้าประเภทลานี้ถูกปิดอยู่ (null = ใช้ได้) */
export function disabledLeaveTypeMessage(type: string | undefined | null, features: FeatureMap): string | null {
  const option = type === 'LATE_ARRIVAL' ? 'lateArrival' : type === 'EARLY_LEAVE' ? 'earlyLeave' : null;
  if (option && !isOptionOn(features, 'leaves', option)) return 'ประเภทการลานี้ถูกปิดใช้งานโดยผู้ดูแลระบบ';
  return null;
}
