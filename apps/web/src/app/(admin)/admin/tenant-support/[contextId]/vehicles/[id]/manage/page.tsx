import { redirect } from 'next/navigation';
import { VEHICLE_MANAGE_DEFAULT_SECTION, adminTenantSupportPath } from '@/constants/routes';

/** Gốc không gian quản lý xe trong phiên — đi thẳng tới mục đầu tiên, như bản gốc. */
export default async function SupportVehicleManageRootPage({
  params,
}: {
  params: Promise<{ contextId: string; id: string }>;
}) {
  const { contextId, id: vehicleId } = await params;
  redirect(
    adminTenantSupportPath.vehicleManageSection(
      contextId,
      vehicleId,
      VEHICLE_MANAGE_DEFAULT_SECTION,
    ),
  );
}
