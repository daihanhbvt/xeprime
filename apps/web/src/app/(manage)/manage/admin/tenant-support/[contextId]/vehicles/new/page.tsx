import { SUPPORT_CAPABILITY, SUPPORT_WORKSPACE } from '@xeprime/types';
import { CreateVehiclePage } from '@/features/vehicles/components/CreateVehiclePage';
import { SupportRoute } from '@/features/tenant-support/components/SupportWorkspaceGate';

/** Tạo xe NHÁP thay gian hàng — CHÍNH `CreateVehiclePage`: không giá, không gửi duyệt (ADR 0050 §13). */
export default function Page() {
  return (
    <SupportRoute
      workspace={SUPPORT_WORKSPACE.MANAGE}
      requires={SUPPORT_CAPABILITY.VEHICLE_CREATE_DRAFT}
    >
      <CreateVehiclePage />
    </SupportRoute>
  );
}
