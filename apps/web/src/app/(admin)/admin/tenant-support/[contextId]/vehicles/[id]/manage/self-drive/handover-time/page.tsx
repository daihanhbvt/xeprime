import { redirect } from 'next/navigation';

import { VEHICLE_MANAGE_SECTION, adminTenantSupportPath } from '@/constants/routes';

/** Đường dẫn CŨ (trước 30/09/2026) — thời gian giao nhận nay là mục chung của xe. */
export default async function Page({
  params,
}: {
  params: Promise<{ contextId: string; id: string }>;
}) {
  const { contextId, id } = await params;
  redirect(
    adminTenantSupportPath.vehicleManageSection(
      contextId,
      id,
      VEHICLE_MANAGE_SECTION.HANDOVER_TIME,
    ),
  );
}
