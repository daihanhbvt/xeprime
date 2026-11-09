import { useLocalSearchParams } from 'expo-router';
import { OWNER_STAGE } from '@xeprime/types';
import { OwnerGate } from '@/features/account/components/OwnerGate';
import { VehicleHandoverTimeScreen } from '@/features/vehicle-manage/VehicleHandoverTimeScreen';

/** Thời gian chết giữa hai chuyến — áp cho CẢ chiếc xe, không khoá theo dịch vụ (khung giờ đã gỡ — ADR 0078). */
export default function ManageOwnerLiteVehicleManageHandoverTimeRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <OwnerGate minStage={OWNER_STAGE.REGISTERING}>
      <VehicleHandoverTimeScreen vehicleId={id} />
    </OwnerGate>
  );
}
