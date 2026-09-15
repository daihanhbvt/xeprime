import { useLocalSearchParams } from 'expo-router';
import { RequireSession } from '@/features/auth/RequireSession';
import { OwnerGate } from '@/features/account/components/OwnerGate';
import { SERVICE_TYPE } from '@xeprime/types';
import { VehicleAutoAcceptScreen } from '@/features/vehicle-manage/VehicleAutoAcceptScreen';

export default function AccountVehicleWithDriverOptimizationRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <RequireSession>
      <OwnerGate>
        <VehicleAutoAcceptScreen vehicleId={id} serviceType={SERVICE_TYPE.WITH_DRIVER} />
      </OwnerGate>
    </RequireSession>
  );
}
