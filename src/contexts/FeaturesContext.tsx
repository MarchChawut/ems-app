/**
 * ==================================================
 * Features Context - สถานะเปิด/ปิดและค่าเริ่มต้นของฟีเจอร์ให้ทุกหน้าใน Dashboard
 * ==================================================
 * โหลดครั้งเดียวใน dashboard/layout.tsx (Server Component) แล้วส่งลงมา — เมนู/วิดเจ็ต/ฟอร์มใช้ตัดสินว่าจะแสดงอะไร
 * หลังแอดมินแก้ในหน้าตั้งค่า เรียก router.refresh() เพื่อให้ layout โหลดค่าใหม่
 * (ฝั่ง server ตรวจซ้ำที่หน้า/API จริงเสมอ ไม่ใช่แค่ซ่อน UI)
 */

'use client';

import { createContext, useContext, useMemo } from 'react';
import { resolveFeatures, isFeatureOn, isOptionOn, type FeatureId, type FeatureMap } from '@/lib/features';

const FeaturesContext = createContext<FeatureMap>(resolveFeatures([]));

export function FeaturesProvider({ features, children }: { features: FeatureMap; children: React.ReactNode }) {
  return <FeaturesContext.Provider value={features}>{children}</FeaturesContext.Provider>;
}

export function useFeatures() {
  const map = useContext(FeaturesContext);
  return useMemo(
    () => ({
      map,
      /** ฟีเจอร์เปิดอยู่ไหม */
      isEnabled: (id: FeatureId) => isFeatureOn(map, id),
      /** ตัวเลือกย่อยเปิดอยู่ไหม (ฟีเจอร์แม่ต้องเปิดด้วย) */
      isOptionEnabled: (id: FeatureId, option: string) => isOptionOn(map, id, option),
      /** ค่าเริ่มต้นที่ตั้งไว้ของฟีเจอร์ */
      config: (id: FeatureId) => map[id].config,
    }),
    [map]
  );
}
