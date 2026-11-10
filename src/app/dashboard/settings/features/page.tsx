import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { canManageFeatures } from '@/lib/features';
import FeaturesSettingsClient from './FeaturesSettingsClient';

// ฟีเจอร์ของระบบ: เปิด/ปิดฟีเจอร์ + ค่าเริ่มต้น — เฉพาะ SUPER_ADMIN
export default async function FeaturesSettingsPage() {
  const user = await getCurrentUser();
  if (!user || !canManageFeatures(user.role)) {
    redirect('/dashboard/settings');
  }

  return <FeaturesSettingsClient />;
}
