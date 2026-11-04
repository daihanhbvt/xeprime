import { SUPPORT_WORKSPACE } from '@xeprime/types';
import { SupportWorkspaceGate } from '@/features/tenant-support/components/SupportWorkspaceGate';
import { VehicleEditPage } from '@/features/vehicles/components/VehicleEditPage';

/**
 * Màn sửa xe trong phiên — cùng trang với `/manage/vehicles/[id]/edit`, cho CẢ hai tuyến từ 03/11/2026
 * (không gian "Quản lý xe" cũ của Owner Lite chuyển hướng tới đây).
 */
export default async function SupportVehicleEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: vehicleId } = await params;
  return (
    <SupportWorkspaceGate workspace={[SUPPORT_WORKSPACE.MANAGE, SUPPORT_WORKSPACE.OWNER_LITE]}>
      <VehicleEditPage vehicleId={vehicleId} />
    </SupportWorkspaceGate>
  );
}
