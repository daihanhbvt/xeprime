import { redirect } from 'next/navigation';

import {
  RENTAL_TERMS_ANCHOR,
  VEHICLE_MANAGE_SECTION,
  ownerVehicleManagePath,
} from '@/constants/routes';

/** Đường dẫn CŨ (trước 30/09/2026) — thủ tục có tài xế nay nằm trong "Nhận chuyến & thủ tục". */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(
    `${ownerVehicleManagePath.section(id, VEHICLE_MANAGE_SECTION.WITH_DRIVER_OPTIMIZATION)}#${RENTAL_TERMS_ANCHOR}`,
  );
}
