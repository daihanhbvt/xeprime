import { useLocalSearchParams } from 'expo-router';
import { RequireSession } from '@/features/auth/RequireSession';
import { OwnerGate } from '@/features/account/components/OwnerGate';
import { VehicleImagesScreen } from '@/features/vehicle-manage/VehicleImagesScreen';

/**
 * Mục "Hình ảnh" — ô ảnh theo GÓC CHỤP, không phải ô tải ảnh phẳng của form sửa xe.
 *
 * Trước đợt này route trỏ vào `VehicleEditFormScreen(tab=MEDIA)`: một danh sách `images: string[]`
 * không nói được tấm nào là mặt trước, và nó còn kéo theo `features` + `description` — hai thứ
 * web đặt ở mục Thông tin.
 */
export default function AccountVehicleManageImagesRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <RequireSession>
      <OwnerGate>
        <VehicleImagesScreen vehicleId={id} />
      </OwnerGate>
    </RequireSession>
  );
}
