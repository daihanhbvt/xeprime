import { SUPPORT_CAPABILITY, SUPPORT_WORKSPACE } from '@xeprime/types';
import { DriversPage } from '@/features/drivers/components/DriversPage';
import { SupportRoute } from '@/features/tenant-support/components/SupportWorkspaceGate';

/** Tài xế — CHÍNH `DriversPage`, chỉ đọc; SĐT/số giấy tờ bị che ở server. */
export default function Page() {
  return (
    <SupportRoute workspace={SUPPORT_WORKSPACE.MANAGE} requires={SUPPORT_CAPABILITY.DRIVER_VIEW}>
      <DriversPage />
    </SupportRoute>
  );
}
