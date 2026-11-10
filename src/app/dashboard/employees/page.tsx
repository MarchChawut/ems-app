import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import EmployeesPageClient from './EmployeesPageClient';

export default async function EmployeesPage() {
  const user = await getCurrentUser();
  if (!user || user.role === 'EMPLOYEE') {
    redirect('/dashboard/profile');
  }

  return <EmployeesPageClient />;
}
