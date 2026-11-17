import { useLocalSearchParams } from 'expo-router';
import { SERVICE_TYPE_VALUES, type ServiceType } from '@xeprime/types';
import { VehiclePricingScreen } from '@/features/vehicle-pricing/VehiclePricingScreen';

/**
 * Mục "Dịch vụ & giá" của màn sửa xe — web `ServicesPane` (ledger §3.6 E8-E12): dải tab dịch vụ,
 * công tắc, nhận chuyến tự động, giá của dịch vụ đang chọn. `service` = tab mở sẵn (bí danh
 * `*-optimization` cũ). Chính sách thuê ở mục riêng (`policy.tsx`).
 */
export default function ManageVehicleEditPricingRoute() {
  const { id, service } = useLocalSearchParams<{ id: string; service?: string }>();
  const initialService = SERVICE_TYPE_VALUES.find((value) => value === service) as
    ServiceType | undefined;
  return (
    <VehiclePricingScreen
      vehicleId={id}
      pane="services"
      {...(initialService ? { initialService } : {})}
    />
  );
}
