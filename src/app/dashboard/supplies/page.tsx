import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { requireFeaturePage } from '@/lib/feature-guard';

import SuppliesPageClient from './SuppliesPageClient';

export default async function SuppliesPage() {
  const user = await getCurrentUser();
  if (!user || user.role === 'EMPLOYEE') {
    redirect('/dashboard/profile');
  }

  // ฟีเจอร์ที่แอดมินปิดไว้ เข้าหน้าไม่ได้ (พาไปหน้าแรกที่ยังเปิดอยู่)
  await requireFeaturePage('supplies', user.role);

  return <SuppliesPageClient />;
}
