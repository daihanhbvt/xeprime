import { useLocalSearchParams } from 'expo-router';
import { SERVICE_TYPE } from '@xeprime/types';
import { RequireSession } from '@/features/auth/RequireSession';
import { OwnerGate } from '@/features/account/components/OwnerGate';
import { VehiclePricingScreen } from '@/features/vehicle-pricing/VehiclePricingScreen';

/** "Giá cho thuê — Có tài xế": cùng màn, thu hẹp về đúng dịch vụ này. Xem route tự lái. */
export default function AccountVehicleWithDriverPricingRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <RequireSession>
      <OwnerGate>
        <VehiclePricingScreen
          vehicleId={id}
          visibleServices={[SERVICE_TYPE.WITH_DRIVER]}
          sectionService={SERVICE_TYPE.WITH_DRIVER}
          policyHidden
          customerScope
        />
      </OwnerGate>
    </RequireSession>
  );
}
