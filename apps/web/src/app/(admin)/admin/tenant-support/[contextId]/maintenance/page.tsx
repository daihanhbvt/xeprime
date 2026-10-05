import { SUPPORT_CAPABILITY, SUPPORT_WORKSPACE } from '@xeprime/types';
import { MaintenanceBoardPage } from '@/features/vehicle-maintenance/components/MaintenanceBoardPage';
import { SupportRoute } from '@/features/tenant-support/components/SupportWorkspaceGate';

/** Bảng bảo dưỡng — CHÍNH `MaintenanceBoardPage`, chỉ xem, không chi phí. */
export default function Page() {
  return (
    <SupportRoute
      workspace={SUPPORT_WORKSPACE.MANAGE}
      requires={SUPPORT_CAPABILITY.MAINTENANCE_VIEW}
    >
      <MaintenanceBoardPage />
    </SupportRoute>
  );
}
