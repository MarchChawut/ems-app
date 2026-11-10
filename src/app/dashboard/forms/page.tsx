import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { requireFeaturePage } from '@/lib/feature-guard';

import { listActiveFormTemplates } from '@/lib/form-templates';
import { listFormRequests, listRequesterOptions, listApproverOptions, listCoordinatorOptions } from '@/lib/form-requests';
import { canUseFormTemplate } from '@/lib/permissions';
import { VEHICLE_REQUEST_SYSTEM_KEY } from '@/lib/vehicle-request';
import FormsPageClient from './FormsPageClient';

export default async function FormsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/');
  }

  await requireFeaturePage('forms', user.role);

  const canVehicle = canUseFormTemplate(user, VEHICLE_REQUEST_SYSTEM_KEY);
  const [templates, { formRequests, meta }, requesterOptions, approverOptions, coordinatorOptions] = await Promise.all([
    listActiveFormTemplates(),
    listFormRequests(user, { page: 1 }),
    // รายชื่อ "ข้าพเจ้า" ของใบขอรถยนต์ — โหลดเฉพาะผู้ที่มีสิทธิ์ใช้ฟอร์มนี้
    canVehicle ? listRequesterOptions(user) : Promise.resolve([]),
    canVehicle ? listApproverOptions() : Promise.resolve([]),
    canVehicle ? listCoordinatorOptions(user) : Promise.resolve([]),
  ]);

  return (
    <FormsPageClient
      initialTemplates={templates}
      initialFormRequests={formRequests}
      initialMeta={meta}
      requesterOptions={requesterOptions}
      approverOptions={approverOptions}
      coordinatorOptions={coordinatorOptions}
    />
  );
}
