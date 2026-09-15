import { useLocalSearchParams } from 'expo-router';
import { RequireSession } from '@/features/auth/RequireSession';
import { OwnerGate } from '@/features/account/components/OwnerGate';
import { VehicleDocumentsScreen } from '@/features/vehicle-documents/VehicleDocumentsScreen';

/** Giấy tờ xe — màn riêng của app (`vehicle-documents`), không phải một tab của form sửa xe. */
export default function AccountVehicleManageDocumentsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <RequireSession>
      <OwnerGate>
        <VehicleDocumentsScreen vehicleId={id} customerScope />
      </OwnerGate>
    </RequireSession>
  );
}
