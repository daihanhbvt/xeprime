import { useLocalSearchParams } from 'expo-router';
import { OWNER_STAGE } from '@xeprime/types';
import { OwnerGate } from '@/features/account/components/OwnerGate';
import { OwnerVehicleServicesScreen } from '@/features/vehicle-manage/OwnerVehicleRentalScreens';
import { parseServiceParam } from '@/navigation/vehicle-manage-section';

/**
 * Mục "Dịch vụ & giá" của màn sửa xe Owner Lite — web `ServicesPane` (`isManage === false`).
 * `service` = tab mở sẵn (link cũ, bí danh `*-optimization`); vắng thì dịch vụ đầu tiên xe đang có.
 */
export default function ManageOwnerLiteVehicleServicesRoute() {
  const { id, service } = useLocalSearchParams<{ id: string; service?: string }>();
  return (
    <OwnerGate minStage={OWNER_STAGE.REGISTERING}>
      <OwnerVehicleServicesScreen vehicleId={id} initialService={parseServiceParam(service)} />
    </OwnerGate>
  );
}
