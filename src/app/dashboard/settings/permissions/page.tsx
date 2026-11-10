import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';
import PermissionsSettingsClient from './PermissionsSettingsClient';

export default async function PermissionsSettingsPage() {
  const user = await getCurrentUser();

  if (!user || !hasPermission(user, PERMISSIONS.PERMISSIONS_MANAGE)) {
    redirect('/dashboard');
  }

  return <PermissionsSettingsClient />;
}
