import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { requireFeaturePage } from '@/lib/feature-guard';

import DocumentsPageClient from './DocumentsPageClient';

export default async function DocumentsPage() {
  const user = await getCurrentUser();
  if (!user || user.role === 'EMPLOYEE') {
    redirect('/dashboard/profile');
  }

  // ฟีเจอร์ที่แอดมินปิดไว้ เข้าหน้าไม่ได้ (พาไปหน้าแรกที่ยังเปิดอยู่)
  await requireFeaturePage('documents', user.role);

  return <DocumentsPageClient />;
}
