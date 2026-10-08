import { useLocalSearchParams } from 'expo-router';
import { OWNER_STAGE } from '@xeprime/types';
import { OwnerGate } from '@/features/account/components/OwnerGate';
import { VehicleTripHistoryScreen } from '@/features/vehicle-manage/VehicleTripHistoryScreen';

export default function ManageOwnerLiteVehicleManageTripHistoryRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <OwnerGate minStage={OWNER_STAGE.REGISTERING}>
      <VehicleTripHistoryScreen vehicleId={id} />
    </OwnerGate>
  );
}
