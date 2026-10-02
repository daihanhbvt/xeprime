import { useLocalSearchParams } from 'expo-router';
import { OWNER_STAGE } from '@xeprime/types';
import { RequireSession } from '@/features/auth/RequireSession';
import { OwnerGate } from '@/features/account/components/OwnerGate';
import { VehicleTripHistoryScreen } from '@/features/vehicle-manage/VehicleTripHistoryScreen';

export default function AccountVehicleManageTripHistoryRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <RequireSession>
      <OwnerGate minStage={OWNER_STAGE.REGISTERING}>
        <VehicleTripHistoryScreen vehicleId={id} />
      </OwnerGate>
    </RequireSession>
  );
}
