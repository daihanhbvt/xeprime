import { Redirect, useLocalSearchParams } from 'expo-router';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useVehicleCapabilities } from '@/features/vehicles/hooks/use-vehicle-capabilities';
import { VehicleMaintenanceScreen } from '@/features/vehicle-maintenance/VehicleMaintenanceScreen';
import { ROUTES } from '@/navigation/routes';
import { VEHICLE_EDIT_TAB } from '@/navigation/vehicle-edit-tab';

/**
 * Mở thẳng mục (thông báo, link cũ) cũng phải qua cùng cổng với menu: web `VehicleEditWorkspace`
 * chỉ bật tab khi `can.maintenance` (quyền ∧ cờ gói) và lui về tab Thông tin khi không. Chờ `/auth/me`
 * xong mới quyết — lúc đang tải cờ gói còn trống, lui sớm là đẩy người có quyền đi mất.
 */
export default function ManageVehicleMaintenanceRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isLoading } = usePermissions();
  const can = useVehicleCapabilities();
  if (!isLoading && !can.maintenance) {
    return <Redirect href={ROUTES.manage.vehicleEditTab(id, VEHICLE_EDIT_TAB.INFORMATION)} />;
  }
  return <VehicleMaintenanceScreen vehicleId={id} />;
}
