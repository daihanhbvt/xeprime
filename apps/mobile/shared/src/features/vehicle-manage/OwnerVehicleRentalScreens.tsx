import { Redirect } from 'expo-router';
import { isVehicleServiceTypeAllowed, type ServiceType } from '@xeprime/types';
import { useVehicle } from '@/features/vehicles/hooks/use-vehicle';
import { ROUTES } from '@/navigation/routes';
import { VEHICLE_MANAGE_SECTION } from '@/navigation/vehicle-manage-section';
import { VehiclePricingScreen } from '@/features/vehicle-pricing/VehiclePricingScreen';

/**
 * Nhóm "Hình thức cho thuê" của màn sửa xe Owner Lite — hai mục, bản native của hai pane web khi
 * `isManage === false`:
 *
 * - "Dịch vụ & giá" (`ServicesPane`): dải tab dịch vụ (loại xe không cho phép thì ẩn) · công tắc
 *   bật/tắt · nhận chuyến tự động · giá của dịch vụ đang mở. Khác gian hàng đúng như web: tab Có tài
 *   xế có cảnh báo giá tạm tính; tab Dài hạn KHÔNG có thẻ "Ưu đãi thuê dài hạn" (gợi ý giá gói nằm
 *   ngay dưới ô giá tháng).
 * - "Chính sách thuê" (`PolicyPane`): sửa thẳng (`policySource="direct"`, không công tắc "Áp dụng
 *   chính sách của gian hàng" — chủ xe không có trang đó) giao xe · cọc · km · quá giờ; thời gian
 *   chết giữa hai chuyến (không có mặc định gian hàng); giấy tờ & điều khoản từng dịch vụ.
 *
 * Cả hai lui về menu sửa xe Owner Lite (`customerScope`).
 */
export function OwnerVehicleServicesScreen({
  vehicleId,
  initialService,
}: {
  vehicleId: string;
  /** Tab mở sẵn — link cũ dưới `self-drive/` · `with-driver/`, bí danh `*-optimization`. */
  initialService?: ServiceType | undefined;
}) {
  const vehicle = useVehicle(vehicleId, Boolean(initialService));
  /*
   * Web `VehicleEditWorkspace` (`initial`): link mở thẳng tab của dịch vụ mà LOẠI XE không cho phép
   * (xe máy - có tài xế) thì rơi về "Thông tin chung", không tự đổi sang dịch vụ khác.
   */
  if (
    initialService &&
    vehicle.data &&
    !isVehicleServiceTypeAllowed(vehicle.data.vehicleType, initialService)
  ) {
    return (
      <Redirect
        href={ROUTES.account.vehicleManageSection(vehicleId, VEHICLE_MANAGE_SECTION.INFORMATION)}
      />
    );
  }
  return (
    <VehiclePricingScreen
      vehicleId={vehicleId}
      customerScope
      pane="services"
      policySource="direct"
      {...(initialService ? { initialService } : {})}
    />
  );
}

export function OwnerVehiclePolicyScreen({
  vehicleId,
  scrollToTerms,
}: {
  vehicleId: string;
  /** Khối điều khoản cần cuộn tới — link cũ `self-drive/terms` · `with-driver/terms`, bí danh `*-terms` (web `termsOf`). */
  scrollToTerms?: ServiceType | undefined;
}) {
  return (
    <VehiclePricingScreen
      vehicleId={vehicleId}
      customerScope
      pane="policy"
      policySource="direct"
      shopPolicyHref={null}
      {...(scrollToTerms ? { scrollToTerms } : {})}
    />
  );
}
