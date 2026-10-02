import { useLocalSearchParams } from 'expo-router';
import { VehicleImagesScreen } from '@/features/vehicle-manage/VehicleImagesScreen';

/**
 * Mục "Hình ảnh" — NGUYÊN section ảnh của khu tài khoản (web 30/09/2026: `VehicleImagesSection`
 * trong `VehicleEditWorkspace`), tự lưu bằng mutation của chính nó; Lui về hub sửa xe.
 */
export default function ManageVehicleEditMediaRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <VehicleImagesScreen vehicleId={id} workspace="manage" />;
}
