import { useLocalSearchParams } from 'expo-router';
import { OWNER_STAGE } from '@xeprime/types';
import { RequireSession } from '@/features/auth/RequireSession';
import { OwnerGate } from '@/features/account/components/OwnerGate';
import { VehicleSurchargesScreen } from '@/features/vehicle-manage/VehicleSurchargesScreen';

export default function AccountVehicleWithDriverSurchargesRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <RequireSession>
      <OwnerGate minStage={OWNER_STAGE.REGISTERING}>
        <VehicleSurchargesScreen vehicleId={id} />
      </OwnerGate>
    </RequireSession>
  );
}
