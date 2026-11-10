/**
 * Feature Guard (ฝั่ง server, ใช้ใน page.tsx) - ฟีเจอร์ที่ปิดอยู่เข้าหน้าไม่ได้ → พาไปหน้าแรกที่ยังเปิดอยู่
 */

import { redirect } from 'next/navigation';
import { getFeatureSettings } from './feature-settings-server';
import { isFeatureOn, landingPath, type FeatureId } from './features';

/** เรียกต้นฟังก์ชันของ page.tsx: ปิดอยู่ → redirect (ไม่ return); เปิดอยู่ → ผ่านไป */
export async function requireFeaturePage(featureId: FeatureId, role: string): Promise<void> {
  const map = await getFeatureSettings();
  if (!isFeatureOn(map, featureId)) {
    redirect(landingPath(map, role));
  }
}
