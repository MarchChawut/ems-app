import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import SettingsPageClient from './SettingsPageClient';

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/');
  }

  return <SettingsPageClient />;
}
