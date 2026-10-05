import { redirect } from 'next/navigation';

import { VEHICLE_MANAGE_SECTION, ownerVehicleManagePath } from '@/constants/routes';

/** Đường dẫn CŨ (trước 30/09/2026) — giao xe tận nơi nay nằm trong mục "Giá & chính sách". */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(ownerVehicleManagePath.section(id, VEHICLE_MANAGE_SECTION.PRICING));
}
