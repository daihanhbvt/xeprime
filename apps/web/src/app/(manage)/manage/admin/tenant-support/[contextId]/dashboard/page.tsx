import { SUPPORT_CAPABILITY, SUPPORT_WORKSPACE } from '@xeprime/types';
import { DashboardView } from '@/features/dashboard/components/DashboardView';
import { SupportRoute } from '@/features/tenant-support/components/SupportWorkspaceGate';

/** Tổng quan của gian hàng tuyến gói — CHÍNH `DashboardView` (thẻ tài chính tự ẩn vì phiên không có `finance.view`). */
export default function Page() {
  return (
    <SupportRoute workspace={SUPPORT_WORKSPACE.MANAGE} requires={SUPPORT_CAPABILITY.BOOKING_VIEW}>
      <DashboardView />
    </SupportRoute>
  );
}
