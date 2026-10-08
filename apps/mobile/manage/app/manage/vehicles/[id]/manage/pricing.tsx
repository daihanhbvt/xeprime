import { useLocalSearchParams } from 'expo-router';
import { OWNER_STAGE } from '@xeprime/types';
import { OwnerGate } from '@/features/account/components/OwnerGate';
import { VehicleManagePricingScreen } from '@/features/vehicle-manage/VehicleManagePricingScreen';

/**
 * Mục "Giá & chính sách" — web `VehiclePricingSection`: giá mọi dịch vụ + cọc · giao xe · km,
 * một nút Lưu, `PUT /vehicles/:id/pricing`. Thay ba mục cũ (giá tự lái, giá có tài xế, giao xe).
 */
export default function ManageOwnerLiteVehicleManagePricingRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <OwnerGate minStage={OWNER_STAGE.REGISTERING}>
      <VehicleManagePricingScreen vehicleId={id} />
    </OwnerGate>
  );
}
