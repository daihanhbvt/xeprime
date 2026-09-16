import { useLocalSearchParams } from 'expo-router';
import { RequireSession } from '@/features/auth/RequireSession';
import { OwnerGate } from '@/features/account/components/OwnerGate';
import { VehicleSurchargesScreen } from '@/features/vehicle-manage/VehicleSurchargesScreen';

export default function AccountVehicleWithDriverSurchargesRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <RequireSession>
      <OwnerGate>
        <VehicleSurchargesScreen vehicleId={id} />
      </OwnerGate>
    </RequireSession>
  );
}
