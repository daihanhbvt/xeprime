import { redirect } from 'next/navigation';

import { VEHICLE_MANAGE_DEFAULT_SECTION, accountVehicleManagePath } from '@/constants/routes';

/** Gốc `/manage` của một xe không có nội dung riêng — đi thẳng tới mục đầu tiên. */
export default async function VehicleManageRootPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(accountVehicleManagePath.section(id, VEHICLE_MANAGE_DEFAULT_SECTION));
}
