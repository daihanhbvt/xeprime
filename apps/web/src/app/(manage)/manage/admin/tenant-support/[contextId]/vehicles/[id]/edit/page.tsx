import { SUPPORT_WORKSPACE } from '@xeprime/types';
import { SupportWorkspaceGate } from '@/features/tenant-support/components/SupportWorkspaceGate';
import { VehicleEditPage } from '@/features/vehicles/components/VehicleEditPage';

/** Hồ sơ xe của gian hàng TUYẾN GÓI trong phiên — cùng trang với `/manage/vehicles/[id]/edit`. */
export default async function SupportVehicleEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: vehicleId } = await params;
  return (
    <SupportWorkspaceGate workspace={SUPPORT_WORKSPACE.MANAGE}>
      <VehicleEditPage vehicleId={vehicleId} />
    </SupportWorkspaceGate>
  );
}
