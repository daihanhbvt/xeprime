import { SUPPORT_CAPABILITY } from '@xeprime/types';
import { HandoverTimeSection } from '@/features/vehicle-manage/components/sections/HandoverTimeSection';
import { SupportRoute } from '@/features/tenant-support/components/SupportWorkspaceGate';

/** Khung giờ giao/nhận + thời gian chết — cùng component với khu tài khoản của chủ xe. */
export default function Page() {
  return (
    <SupportRoute requires={SUPPORT_CAPABILITY.VEHICLE_OPERATIONS_UPDATE}>
      <HandoverTimeSection />
    </SupportRoute>
  );
}
