import { useLocalSearchParams } from 'expo-router';
import { OWNER_STAGE } from '@xeprime/types';
import { OwnerGate } from '@/features/account/components/OwnerGate';
import { VehicleDocumentsScreen } from '@/features/vehicle-documents/VehicleDocumentsScreen';

/** Giấy tờ xe — màn riêng của app (`vehicle-documents`), không phải một tab của form sửa xe. */
export default function ManageOwnerLiteVehicleManageDocumentsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <OwnerGate minStage={OWNER_STAGE.REGISTERING}>
      <VehicleDocumentsScreen vehicleId={id} customerScope />
    </OwnerGate>
  );
}
