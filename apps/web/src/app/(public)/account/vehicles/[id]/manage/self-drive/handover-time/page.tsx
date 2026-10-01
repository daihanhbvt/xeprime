import { redirect } from 'next/navigation';

import { VEHICLE_MANAGE_SECTION, accountVehicleManagePath } from '@/constants/routes';

/** Đường dẫn CŨ (trước 30/09/2026) — thời gian giao nhận nay là mục chung, không thuộc tự lái. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(accountVehicleManagePath.section(id, VEHICLE_MANAGE_SECTION.HANDOVER_TIME));
}
