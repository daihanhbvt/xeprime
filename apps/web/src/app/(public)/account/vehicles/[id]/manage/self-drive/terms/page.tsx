import { redirect } from 'next/navigation';

import {
  RENTAL_TERMS_ANCHOR,
  VEHICLE_MANAGE_SECTION,
  accountVehicleManagePath,
} from '@/constants/routes';

/** Đường dẫn CŨ (trước 30/09/2026) — thủ tục tự lái nay nằm trong "Nhận chuyến & thủ tục". */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(
    `${accountVehicleManagePath.section(id, VEHICLE_MANAGE_SECTION.SELF_DRIVE_OPTIMIZATION)}#${RENTAL_TERMS_ANCHOR}`,
  );
}
