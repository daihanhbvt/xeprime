import { useLocalSearchParams } from 'expo-router';
import { OWNER_STAGE, SERVICE_TYPE } from '@xeprime/types';
import { OwnerGate } from '@/features/account/components/OwnerGate';
import { VehicleBookingTermsScreen } from '@/features/vehicle-manage/VehicleBookingTermsScreen';
import { RENTAL_TERMS_ANCHOR } from '@/navigation/vehicle-manage-section';

/** "Nhận chuyến & thủ tục" — web `BookingTermsSection` (tự nhận chuyến + thủ tục cho thuê). */
export default function ManageOwnerLiteVehicleSelfDriveOptimizationRoute() {
  const { id, anchor } = useLocalSearchParams<{ id: string; anchor?: string }>();
  return (
    <OwnerGate minStage={OWNER_STAGE.REGISTERING}>
      <VehicleBookingTermsScreen
        vehicleId={id}
        serviceType={SERVICE_TYPE.SELF_DRIVE}
        scrollToTerms={anchor === RENTAL_TERMS_ANCHOR}
      />
    </OwnerGate>
  );
}
