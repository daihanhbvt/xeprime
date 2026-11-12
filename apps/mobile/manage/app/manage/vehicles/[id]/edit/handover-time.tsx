import { useLocalSearchParams } from 'expo-router';
import { VehicleHandoverTimeScreen } from '@/features/vehicle-manage/VehicleHandoverTimeScreen';

/** Mục "Thời gian chết giữa hai chuyến" của màn sửa xe (web `TurnaroundCard`; khung giờ đã gỡ — ADR 0078). */
export default function ManageVehicleEditHandoverTimeRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <VehicleHandoverTimeScreen vehicleId={id} workspace="manage" />;
}
