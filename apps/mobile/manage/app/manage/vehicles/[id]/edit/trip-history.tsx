import { useLocalSearchParams } from 'expo-router';
import { VehicleTripHistoryScreen } from '@/features/vehicle-manage/VehicleTripHistoryScreen';

/** Mục "Lịch sử chuyến" của màn sửa xe — CÙNG section với khu tài khoản (web `vehicle-edit-nav.ts`). */
export default function ManageVehicleEditTripHistoryRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <VehicleTripHistoryScreen vehicleId={id} workspace="manage" />;
}
