import { useLocalSearchParams } from 'expo-router';
import { OWNER_STAGE } from '@xeprime/types';
import { RequireSession } from '@/features/auth/RequireSession';
import { OwnerGate } from '@/features/account/components/OwnerGate';
import { VehicleHandoverTimeScreen } from '@/features/vehicle-manage/VehicleHandoverTimeScreen';

export default function AccountVehicleSelfDriveHandoverTimeRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <RequireSession>
      <OwnerGate minStage={OWNER_STAGE.REGISTERING}>
        <VehicleHandoverTimeScreen vehicleId={id} />
      </OwnerGate>
    </RequireSession>
  );
}
