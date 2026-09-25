import { SUPPORT_WORKSPACE } from '@xeprime/types';
import type { ReactNode } from 'react';
import { SupportWorkspaceGate } from '@/features/tenant-support/components/SupportWorkspaceGate';
import { VehicleManageWorkspace } from '@/features/vehicle-manage/components/VehicleManageWorkspace';

/**
 * Không gian "Quản lý xe" của chủ xe TUYẾN HOA HỒNG trong phiên — cùng `VehicleManageWorkspace`
 * với `/account/vehicles/[id]/manage`. Menu tự chỉ còn các mục của Đợt 1 (đọc phiên).
 */
export default async function SupportVehicleManageLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id: vehicleId } = await params;
  return (
    <SupportWorkspaceGate workspace={SUPPORT_WORKSPACE.OWNER_LITE}>
      <VehicleManageWorkspace vehicleId={vehicleId}>{children}</VehicleManageWorkspace>
    </SupportWorkspaceGate>
  );
}
