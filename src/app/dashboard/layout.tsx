/**
 * ==================================================
 * Dashboard Layout - โครงสร้างหลักของหน้า Dashboard
 * ==================================================
 * Server Component: ตรวจสอบ session ครั้งเดียวฝั่ง server (ไม่ต้องยิง
 * /api/auth/session จากฝั่ง client) แล้วส่ง user ลงไปให้ทุกหน้าผ่าน
 * UserContext เพื่อไม่ให้แต่ละหน้าต้อง fetch session ซ้ำเอง
 */

import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { UserProvider } from '@/contexts/UserContext';
import { OrgProvider } from '@/contexts/OrgContext';
import { getOrgSettings } from '@/lib/org-settings-server';
import { FeaturesProvider } from '@/contexts/FeaturesContext';
import { getFeatureSettings } from '@/lib/feature-settings-server';
import DashboardShell from '@/components/dashboard/DashboardShell';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/');
  }

  // บัญชีที่แอดมินตั้งรหัสผ่านให้ยังตั้งค่าความปลอดภัยครั้งแรกไม่เสร็จ → ไปหน้าตั้งค่าก่อน (ฝั่ง API ก็ถูกบล็อกที่ requireAuth ด้วย)
  if (user.mustChangePassword || user.forcePasskeySetup) {
    redirect('/security-setup');
  }

  const [org, features] = await Promise.all([getOrgSettings(), getFeatureSettings()]);

  return (
    <UserProvider user={user}>
      <OrgProvider org={org}>
        <FeaturesProvider features={features}>
          <DashboardShell user={user}>{children}</DashboardShell>
        </FeaturesProvider>
      </OrgProvider>
    </UserProvider>
  );
}
