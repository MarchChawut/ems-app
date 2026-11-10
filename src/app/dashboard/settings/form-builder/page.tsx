import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { requireFeaturePage } from '@/lib/feature-guard';

import { hasPermission, PERMISSIONS } from '@/lib/permissions';
import { listAllFormTemplates } from '@/lib/form-templates';
import FormBuilderClient from './FormBuilderClient';

export default async function FormBuilderPage() {
  const user = await getCurrentUser();

  if (!user || !hasPermission(user, PERMISSIONS.FORMS_MANAGE_TEMPLATES)) {
    redirect('/dashboard');
  }

  await requireFeaturePage('forms', user.role);

  const templates = await listAllFormTemplates();

  return <FormBuilderClient initialTemplates={templates} />;
}
