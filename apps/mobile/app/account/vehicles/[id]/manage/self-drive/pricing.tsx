import { useLocalSearchParams } from 'expo-router';
import { SERVICE_TYPE } from '@xeprime/types';
import { RequireSession } from '@/features/auth/RequireSession';
import { OwnerGate } from '@/features/account/components/OwnerGate';
import { VehiclePricingScreen } from '@/features/vehicle-pricing/VehiclePricingScreen';

/**
 * "Giá cho thuê — Tự lái" của không gian quản lý xe.
 *
 * Thu hẹp CHÍNH màn Giá & chính sách xuống một dịch vụ và giấu khối chính sách, đúng cặp
 * `visibleServices` + `policyMode="hidden"` mà web truyền vào `VehiclePricingWorkspace`. Không
 * dựng form thứ hai: hai form cùng ghi `PUT /vehicles/:id/pricing` thì hai bộ ràng buộc giá sẽ
 * trôi khỏi nhau. Chính sách có màn riêng dễ đọc hơn ở ngay menu này.
 */
export default function AccountVehicleSelfDrivePricingRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <RequireSession>
      <OwnerGate>
        <VehiclePricingScreen
          vehicleId={id}
          /*
            ĐÚNG MỘT dịch vụ, như web (`visibleServices={[serviceType]}`).
            Bản trước kèm `LONG_TERM` để chủ xe còn chỗ đặt giá tháng — nhưng web không làm thế,
            và hai bên cho phép khai những ô khác nhau trên cùng một endpoint là cách chắc nhất
            để hai bộ ràng buộc giá trôi khỏi nhau. Giá thuê dài hạn khai ở màn Giá & chính sách
            đầy đủ của cổng quản lý.
          */
          visibleServices={[SERVICE_TYPE.SELF_DRIVE]}
          sectionService={SERVICE_TYPE.SELF_DRIVE}
          policyHidden
          customerScope
        />
      </OwnerGate>
    </RequireSession>
  );
}
