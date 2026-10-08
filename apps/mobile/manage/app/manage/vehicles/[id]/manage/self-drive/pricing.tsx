import { Redirect, useLocalSearchParams } from 'expo-router';
import { ROUTES } from '@/navigation/routes';
import { VEHICLE_MANAGE_SECTION } from '@/navigation/vehicle-manage-section';

/** Đường dẫn CŨ (trước 30/09/2026) — giá tự lái nay nằm trong "Giá & chính sách". Cùng chuyển hướng với trang web. */
export default function LegacySelfDrivePricingRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Redirect href={ROUTES.account.vehicleManageSection(id, VEHICLE_MANAGE_SECTION.PRICING)} />
  );
}
