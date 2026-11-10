import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { requireFeaturePage } from '@/lib/feature-guard';

import LeavesPageClient from './LeavesPageClient';

export default async function LeavesPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/');
  }

  // ฟีเจอร์ที่แอดมินปิดไว้ เข้าหน้าไม่ได้ (พาไปหน้าแรกที่ยังเปิดอยู่)
  await requireFeaturePage('leaves', user.role);

  return <LeavesPageClient />;
}
