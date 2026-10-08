import {
  OWNER_POLICY_BLOCKS,
  VehiclePricingScreen,
} from '@/features/vehicle-pricing/VehiclePricingScreen';

/**
 * Mục "Giá & chính sách" của không gian Quản lý xe ở KHU TÀI KHOẢN — web `VehiclePricingSection`.
 *
 * CÙNG màn giá với cổng quản lý, cấu hình đúng như web truyền: mọi dịch vụ xe đang có, ba khối
 * chính sách của chủ xe (cọc · giao xe · km), không trang chính sách gian hàng
 * (`shopPolicyHref={null}`), `policySource="direct"`. Một nút Lưu, `PUT /vehicles/:id/pricing`.
 */
export function VehicleManagePricingScreen({ vehicleId }: { vehicleId: string }) {
  return (
    <VehiclePricingScreen
      vehicleId={vehicleId}
      customerScope
      policyBlocks={OWNER_POLICY_BLOCKS}
      shopPolicyHref={null}
      policySource="direct"
    />
  );
}
