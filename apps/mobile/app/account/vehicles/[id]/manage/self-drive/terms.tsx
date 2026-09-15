import { useLocalSearchParams } from 'expo-router';
import { RequireSession } from '@/features/auth/RequireSession';
import { OwnerGate } from '@/features/account/components/OwnerGate';
import { SERVICE_TYPE } from '@xeprime/types';
import { VehicleTermsScreen } from '@/features/vehicle-manage/VehicleTermsScreen';

export default function AccountVehicleSelfDriveTermsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <RequireSession>
      <OwnerGate>
        <VehicleTermsScreen vehicleId={id} serviceType={SERVICE_TYPE.SELF_DRIVE} />
      </OwnerGate>
    </RequireSession>
  );
}
