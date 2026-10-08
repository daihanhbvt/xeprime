import { Redirect, useLocalSearchParams } from 'expo-router';
import { ROUTES } from '@/navigation/routes';
import { VEHICLE_EDIT_TAB } from '@/navigation/vehicle-edit-tab';

/**
 * Giá & chính sách theo XE — đã dời vào màn sửa xe (web 29/09/2026). Route cũ giữ lại dưới dạng
 * CHUYỂN HƯỚNG, đúng trang redirect bên web: nó nằm trong link đã gửi đi và thông báo cũ.
 */
export default function LegacyManageVehiclePricingRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={ROUTES.manage.vehicleEditTab(id, VEHICLE_EDIT_TAB.PRICING)} />;
}
