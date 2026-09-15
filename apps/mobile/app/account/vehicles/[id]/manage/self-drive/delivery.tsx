import { useLocalSearchParams } from 'expo-router';
import { RequireSession } from '@/features/auth/RequireSession';
import { OwnerGate } from '@/features/account/components/OwnerGate';
import { VehicleDeliveryScreen } from '@/features/vehicle-manage/VehicleDeliveryScreen';

export default function AccountVehicleSelfDriveDeliveryRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <RequireSession>
      <OwnerGate>
        <VehicleDeliveryScreen vehicleId={id} />
      </OwnerGate>
    </RequireSession>
  );
}
