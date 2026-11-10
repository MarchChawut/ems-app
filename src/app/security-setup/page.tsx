/**
 * ==================================================
 * Security Setup Page - ตั้งค่าความปลอดภัยครั้งแรก
 * ==================================================
 * บัญชีที่แอดมินตั้งรหัสผ่านให้ (นำเข้า/สร้าง/รีเซ็ต) ต้องเปลี่ยนรหัสผ่านเอง และลงทะเบียน passkey ก่อนใช้งานระบบ
 * (2FA บังคับตอนล็อกอินอยู่แล้ว) — อยู่นอก /dashboard เพื่อไม่ผ่าน layout ที่ redirect มาที่นี่ (กัน loop)
 */

import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import SecuritySetupClient from './SecuritySetupClient';

export default async function SecuritySetupPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/');
  }
  if (!user.mustChangePassword && !user.forcePasskeySetup) {
    redirect('/dashboard');
  }

  return <SecuritySetupClient name={user.name} />;
}
