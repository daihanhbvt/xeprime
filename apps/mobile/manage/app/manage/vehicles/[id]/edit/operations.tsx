import { Redirect, useLocalSearchParams } from 'expo-router';
import { ROUTES } from '@/navigation/routes';
import { VEHICLE_EDIT_TAB } from '@/navigation/vehicle-edit-tab';

/**
 * Tab CŨ "Vận hành & điều kiện thuê" — nay là bí danh của "Thời gian giao nhận" (web
 * `resolveEditTab`). Giữ route để link/thông báo cũ không thành ngõ cụt.
 */
export default function LegacyManageVehicleOperationsRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={ROUTES.manage.vehicleEditTab(id, VEHICLE_EDIT_TAB.HANDOVER_TIME)} />;
}
