import { SERVICE_TYPE, SUPPORT_CAPABILITY } from '@xeprime/types';
import { BookingTermsSection } from '@/features/vehicle-manage/components/sections/BookingTermsSection';
import { SupportRoute } from '@/features/tenant-support/components/SupportWorkspaceGate';

/**
 * "Nhận chuyến & thủ tục" tự lái — công tắc tự nhận chuyến chỉ đọc trong phiên, và card thủ tục
 * (khu TIỀN) không dựng trong phiên (ADR 0050 §13).
 */
export default function Page() {
  return (
    <SupportRoute requires={SUPPORT_CAPABILITY.VEHICLE_OPERATIONS_UPDATE}>
      <BookingTermsSection serviceType={SERVICE_TYPE.SELF_DRIVE} />
    </SupportRoute>
  );
}
