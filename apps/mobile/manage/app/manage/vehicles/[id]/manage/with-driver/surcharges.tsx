import { useLocalSearchParams } from 'expo-router';
import { OWNER_STAGE } from '@xeprime/types';
import { OwnerGate } from '@/features/account/components/OwnerGate';
import { VehicleSurchargesScreen } from '@/features/vehicle-manage/VehicleSurchargesScreen';

export default function ManageOwnerLiteVehicleWithDriverSurchargesRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <OwnerGate minStage={OWNER_STAGE.REGISTERING}>
      <VehicleSurchargesScreen vehicleId={id} />
    </OwnerGate>
  );
}
