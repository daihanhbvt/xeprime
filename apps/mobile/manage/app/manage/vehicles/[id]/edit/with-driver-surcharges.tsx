import { useLocalSearchParams } from 'expo-router';
import { VehicleSurchargesScreen } from '@/features/vehicle-manage/VehicleSurchargesScreen';

/** Mục "Phụ phí" (có tài xế) của màn sửa xe — web `DriverSurchargesSection`. */
export default function ManageVehicleEditWithDriverSurchargesRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <VehicleSurchargesScreen vehicleId={id} workspace="manage" />;
}
