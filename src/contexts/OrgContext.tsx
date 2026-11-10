/**
 * ==================================================
 * Org Context - แชร์ชื่อสังกัด/ชื่อกองหลักให้ทุกหน้าใน Dashboard
 * ==================================================
 * โหลดครั้งเดียวใน dashboard/layout.tsx (Server Component) แล้วส่งลงมา — ใช้เป็นหัวกระดาษ/ผู้รับของแบบฟอร์มทั้งหมด
 * หลังแอดมินแก้ในหน้าตั้งค่า เรียก router.refresh() เพื่อให้ layout โหลดค่าใหม่
 */

'use client';

import { createContext, useContext } from 'react';
import { DEFAULT_ORG, type OrgInfo } from '@/lib/org-settings';

const OrgContext = createContext<OrgInfo>(DEFAULT_ORG);

export function OrgProvider({ org, children }: { org: OrgInfo; children: React.ReactNode }) {
  return <OrgContext.Provider value={org}>{children}</OrgContext.Provider>;
}

/** ชื่อสังกัด/ชื่อกองหลักปัจจุบัน (นอก OrgProvider ได้ค่าเริ่มต้น) */
export function useOrg(): OrgInfo {
  return useContext(OrgContext);
}
