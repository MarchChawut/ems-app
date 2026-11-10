import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { requireFeaturePage } from '@/lib/feature-guard';

import RosterPageClient from './RosterPageClient';

// ตารางเวรประจำกอง: ทุกคนที่ล็อกอินดูได้ (สิทธิ์เพิ่ม/แก้ไข/ลบตรวจที่ฝั่ง client ตาม roster.manage และที่ API)
export default async function RosterPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/');
  }

  // ฟีเจอร์ที่แอดมินปิดไว้ เข้าหน้าไม่ได้ (พาไปหน้าแรกที่ยังเปิดอยู่)
  await requireFeaturePage('roster', user.role);

  return <RosterPageClient />;
}
