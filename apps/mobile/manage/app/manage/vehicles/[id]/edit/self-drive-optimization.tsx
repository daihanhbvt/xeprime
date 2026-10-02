import { Redirect, useLocalSearchParams } from 'expo-router';
import { PERMISSION, SERVICE_TYPE } from '@xeprime/types';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { VehicleBookingTermsScreen } from '@/features/vehicle-manage/VehicleBookingTermsScreen';
import { selfDriveOptimizationTarget } from '@/features/vehicles/edit-nav';
import { useVehicle } from '@/features/vehicles/hooks/use-vehicle';
import { ROUTES } from '@/navigation/routes';
import { VEHICLE_EDIT_TAB } from '@/navigation/vehicle-edit-tab';
import { RENTAL_TERMS_ANCHOR } from '@/navigation/vehicle-manage-section';

/**
 * "Nhận chuyến & thủ tục" (tự lái) của màn sửa xe — web `BookingTermsSection`.
 *
 * Như `VehicleEditWorkspace` web: xe chỉ có dịch vụ có tài xế thì mục này mở thẳng mục CÓ TÀI XẾ
 * (giữ hành vi route `/optimization` cũ). Hồ sơ xe đọc từ cùng khoá cache với vỏ của mục.
 */
export default function ManageVehicleEditSelfDriveOptimizationRoute() {
  const { id, anchor } = useLocalSearchParams<{ id: string; anchor?: string }>();
  const { has } = usePermissions();
  const vehicle = useVehicle(id, has(PERMISSION.VEHICLE_VIEW));
  const scrollToTerms = anchor === RENTAL_TERMS_ANCHOR;

  if (
    vehicle.data &&
    selfDriveOptimizationTarget(vehicle.data.serviceTypes ?? []) ===
      VEHICLE_EDIT_TAB.WITH_DRIVER_OPTIMIZATION
  ) {
    return (
      <Redirect
        href={ROUTES.manage.vehicleEditTab(
          id,
          scrollToTerms
            ? VEHICLE_EDIT_TAB.WITH_DRIVER_TERMS
            : VEHICLE_EDIT_TAB.WITH_DRIVER_OPTIMIZATION,
        )}
      />
    );
  }

  return (
    <VehicleBookingTermsScreen
      vehicleId={id}
      serviceType={SERVICE_TYPE.SELF_DRIVE}
      scrollToTerms={scrollToTerms}
      workspace="manage"
    />
  );
}
