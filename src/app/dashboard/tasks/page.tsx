import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { requireFeaturePage } from '@/lib/feature-guard';

import TasksPageClient from './TasksPageClient';

export default async function TasksPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/');
  }

  // ฟีเจอร์ที่แอดมินปิดไว้ เข้าหน้าไม่ได้ (พาไปหน้าแรกที่ยังเปิดอยู่)
  await requireFeaturePage('tasks', user.role);

  return <TasksPageClient />;
}
