import { SUPPORT_CAPABILITY } from '@xeprime/types';
import { VehicleDetailPage } from '@/features/vehicles/components/VehicleDetailPage';
import { SupportRoute } from '@/features/tenant-support/components/SupportWorkspaceGate';

/** Hồ sơ 360 của một xe — CHÍNH `VehicleDetailPage`. */
export default function Page() {
  return (
    <SupportRoute requires={SUPPORT_CAPABILITY.VEHICLE_VIEW}>
      <VehicleDetailPage />
    </SupportRoute>
  );
}
