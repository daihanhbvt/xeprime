import { useLocalSearchParams } from 'expo-router';
import { OWNER_STAGE } from '@xeprime/types';
import { RequireSession } from '@/features/auth/RequireSession';
import { OwnerGate } from '@/features/account/components/OwnerGate';
import { SERVICE_TYPE } from '@xeprime/types';
import { VehicleAutoAcceptScreen } from '@/features/vehicle-manage/VehicleAutoAcceptScreen';

export default function AccountVehicleWithDriverOptimizationRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <RequireSession>
      <OwnerGate minStage={OWNER_STAGE.REGISTERING}>
        <VehicleAutoAcceptScreen vehicleId={id} serviceType={SERVICE_TYPE.WITH_DRIVER} />
      </OwnerGate>
    </RequireSession>
  );
}
