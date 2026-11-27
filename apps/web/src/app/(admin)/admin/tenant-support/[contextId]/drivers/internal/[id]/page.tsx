import { SUPPORT_CAPABILITY, SUPPORT_WORKSPACE } from '@xeprime/types';
import { InternalDriverDetailPage } from '@/features/drivers/components/InternalDriverDetailPage';
import { SupportRoute } from '@/features/tenant-support/components/SupportWorkspaceGate';

/** Chi tiết một tài xế nội bộ — CHÍNH `InternalDriverDetailPage`, chỉ đọc. */
export default function Page() {
  return (
    <SupportRoute workspace={SUPPORT_WORKSPACE.MANAGE} requires={SUPPORT_CAPABILITY.DRIVER_VIEW}>
      <InternalDriverDetailPage />
    </SupportRoute>
  );
}
