/**
 * Feature Settings (ฝั่ง server) - อ่านการเปิด/ปิดฟีเจอร์จากฐานข้อมูล (แคชสั้นๆ ในหน่วยความจำ)
 * แยกจาก features.ts เพราะไฟล์นั้นต้อง import ได้จาก client/script โดยไม่ลาก prisma เข้าไปด้วย
 */

import { prisma } from './prisma';
import { logger } from './logger';
import { resolveFeatures, isFeatureOn, type FeatureId, type FeatureMap } from './features';

const CACHE_TTL_MS = 5_000;
let cache: { at: number; map: FeatureMap } | null = null;
/** ค่าล่าสุดที่อ่านสำเร็จ (ใช้แทนเมื่อ DB อ่านไม่ได้ ดีกว่าเปิดทุกฟีเจอร์) */
let lastGood: FeatureMap | null = null;
/** เลขรุ่นของแคช: clearFeatureCache เพิ่มเลข เพื่อไม่ให้การอ่านที่เริ่มก่อนล้างแคชมาเขียนทับค่าเก่าหลังล้าง (race) */
let generation = 0;

/** ล้างแคช (เรียกหลังแอดมินแก้การตั้งค่า เพื่อให้มีผลทันทีบน process นี้) */
export function clearFeatureCache(): void {
  generation += 1;
  cache = null;
  lastGood = null;
}

/**
 * ค่าฟีเจอร์ปัจจุบัน — อ่านไม่ได้ (DB มีปัญหา) → ใช้ค่าล่าสุดที่อ่านสำเร็จ ถ้าไม่เคยอ่านได้เลยจึงถือว่าเปิดทั้งหมด (fail-open) และ log
 * ไม่ให้ข้อผิดพลาดของระบบ flag ทำให้ทั้งระบบใช้งานไม่ได้ (flag ไม่ใช่กลไกควบคุมสิทธิ์ — สิทธิ์ผู้ใช้ตรวจแยกเสมอ)
 */
export async function getFeatureSettings(): Promise<FeatureMap> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.map;
  const startedAt = generation;
  try {
    const rows = await prisma.featureSetting.findMany();
    const map = resolveFeatures(rows);
    if (generation === startedAt) {
      cache = { at: now, map };
      lastGood = map;
    }
    return map;
  } catch (error) {
    logger.error('Load feature settings failed', { error, fallback: lastGood ? 'last-known-good' : 'all-enabled' });
    return lastGood ?? resolveFeatures([]);
  }
}

export async function isFeatureEnabled(id: FeatureId): Promise<boolean> {
  return isFeatureOn(await getFeatureSettings(), id);
}
