import { useLocalSearchParams } from 'expo-router';
import { VehicleHandoverTimeScreen } from '@/features/vehicle-manage/VehicleHandoverTimeScreen';

/** Mục "Thời gian giao nhận" của màn sửa xe — CÙNG section với khu tài khoản (web `HandoverTimeSection`). */
export default function ManageVehicleEditHandoverTimeRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <VehicleHandoverTimeScreen vehicleId={id} workspace="manage" />;
}
