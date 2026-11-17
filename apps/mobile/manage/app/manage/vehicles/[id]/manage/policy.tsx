import { useLocalSearchParams } from 'expo-router';
import { OWNER_STAGE } from '@xeprime/types';
import { OwnerGate } from '@/features/account/components/OwnerGate';
import { OwnerVehiclePolicyScreen } from '@/features/vehicle-manage/OwnerVehicleRentalScreens';
import { parseServiceParam, RENTAL_TERMS_ANCHOR } from '@/navigation/vehicle-manage-section';

/**
 * Mục "Chính sách thuê" của màn sửa xe Owner Lite — web `PolicyPane` (`isManage === false`).
 * `anchor=rental-terms` + `service` = cuộn tới khối điều khoản của dịch vụ đó (web `termsOf`).
 */
export default function ManageOwnerLiteVehiclePolicyRoute() {
  const { id, anchor, service } = useLocalSearchParams<{
    id: string;
    anchor?: string;
    service?: string;
  }>();
  return (
    <OwnerGate minStage={OWNER_STAGE.REGISTERING}>
      <OwnerVehiclePolicyScreen
        vehicleId={id}
        scrollToTerms={anchor === RENTAL_TERMS_ANCHOR ? parseServiceParam(service) : undefined}
      />
    </OwnerGate>
  );
}
