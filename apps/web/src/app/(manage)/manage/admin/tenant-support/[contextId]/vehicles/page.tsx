import { SUPPORT_CAPABILITY } from '@xeprime/types';
import { SupportVehiclesRoute } from '@/features/tenant-support/components/SupportWorkspaceRoutes';
import { SupportRoute } from '@/features/tenant-support/components/SupportWorkspaceGate';

/** Danh sách xe — CHÍNH màn xe của bộ giao diện gian hàng đang dùng (Full Manage hoặc Owner Lite). */
export default function Page() {
  return (
    <SupportRoute requires={SUPPORT_CAPABILITY.VEHICLE_VIEW}>
      <SupportVehiclesRoute />
    </SupportRoute>
  );
}
