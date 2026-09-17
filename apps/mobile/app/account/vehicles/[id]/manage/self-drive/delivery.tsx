import { useLocalSearchParams } from 'expo-router';
import { OWNER_STAGE } from '@xeprime/types';
import { RequireSession } from '@/features/auth/RequireSession';
import { OwnerGate } from '@/features/account/components/OwnerGate';
import { VehicleDeliveryScreen } from '@/features/vehicle-manage/VehicleDeliveryScreen';

export default function AccountVehicleSelfDriveDeliveryRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <RequireSession>
      <OwnerGate minStage={OWNER_STAGE.REGISTERING}>
        <VehicleDeliveryScreen vehicleId={id} />
      </OwnerGate>
    </RequireSession>
  );
}
