import { Redirect, useLocalSearchParams } from 'expo-router';
import { ROUTES } from '@/navigation/routes';
import { VEHICLE_EDIT_TAB } from '@/navigation/vehicle-edit-tab';

/**
 * Tối ưu nhận chuyến — đã dời vào màn sửa xe (web 29/09/2026). Chuyển hướng về mục TỰ LÁI như
 * web; route của mục đó tự đổi sang có tài xế khi xe chỉ phục vụ có tài xế.
 */
export default function LegacyManageVehicleOptimizationRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Redirect href={ROUTES.manage.vehicleEditTab(id, VEHICLE_EDIT_TAB.SELF_DRIVE_OPTIMIZATION)} />
  );
}
