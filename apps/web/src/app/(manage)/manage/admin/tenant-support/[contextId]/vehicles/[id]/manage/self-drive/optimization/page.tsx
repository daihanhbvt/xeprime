import { SERVICE_TYPE, SUPPORT_CAPABILITY } from '@xeprime/types';
import { AutoAcceptSection } from '@/features/vehicle-manage/components/sections/AutoAcceptSection';
import { SupportRoute } from '@/features/tenant-support/components/SupportWorkspaceGate';

/** Điều kiện nhận chuyến — công tắc tự nhận chuyến chỉ đọc trong phiên (ADR 0050 §13). */
export default function Page() {
  return (
    <SupportRoute requires={SUPPORT_CAPABILITY.VEHICLE_OPERATIONS_UPDATE}>
      <AutoAcceptSection serviceType={SERVICE_TYPE.SELF_DRIVE} />
    </SupportRoute>
  );
}
