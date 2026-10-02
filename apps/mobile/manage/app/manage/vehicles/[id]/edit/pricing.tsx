import { useLocalSearchParams } from 'expo-router';
import { VehiclePricingScreen } from '@/features/vehicle-pricing/VehiclePricingScreen';

/**
 * Mục "Giá & chính sách" của màn sửa xe — web `VehiclePricingTab` (`VehiclePricingWorkspace` chế
 * độ `full`): giá mọi dịch vụ xe đang có + nguồn chính sách, một nút Lưu. Mặc định của
 * `VehiclePricingScreen` khớp đúng bộ props đó; Lui về hub sửa xe.
 */
export default function ManageVehicleEditPricingRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <VehiclePricingScreen vehicleId={id} />;
}
