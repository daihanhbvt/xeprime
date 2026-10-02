import { Redirect, useLocalSearchParams } from 'expo-router';
import { ROUTES } from '@/navigation/routes';
import { VEHICLE_MANAGE_SECTION } from '@/navigation/vehicle-manage-section';

/** Đường dẫn CŨ (trước 30/09/2026) — thời gian giao nhận nay áp cho cả xe. Cùng chuyển hướng với trang web. */
export default function LegacySelfDriveHandoverTimeRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Redirect
      href={ROUTES.account.vehicleManageSection(id, VEHICLE_MANAGE_SECTION.HANDOVER_TIME)}
    />
  );
}
