import { SUPPORT_CAPABILITY, SUPPORT_WORKSPACE } from '@xeprime/types';
import { DriverDetailPage } from '@/features/drivers/components/DriverDetailPage';
import { SupportRoute } from '@/features/tenant-support/components/SupportWorkspaceGate';

/** Chi tiết một tài xế liên kết — CHÍNH `DriverDetailPage`, chỉ đọc; SĐT bị che ở server. */
export default function Page() {
  return (
    <SupportRoute workspace={SUPPORT_WORKSPACE.MANAGE} requires={SUPPORT_CAPABILITY.DRIVER_VIEW}>
      <DriverDetailPage />
    </SupportRoute>
  );
}
