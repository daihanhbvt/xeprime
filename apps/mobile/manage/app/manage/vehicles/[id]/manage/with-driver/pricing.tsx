import { Redirect, useLocalSearchParams } from 'expo-router';
import { ROUTES } from '@/navigation/routes';
import { VEHICLE_MANAGE_SECTION } from '@/navigation/vehicle-manage-section';

/** Đường dẫn CŨ (trước 30/09/2026) — giá có tài xế nay nằm trong "Giá & chính sách". Cùng chuyển hướng với trang web. */
export default function LegacyWithDriverPricingRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Redirect href={ROUTES.account.vehicleManageSection(id, VEHICLE_MANAGE_SECTION.PRICING)} />
  );
}
