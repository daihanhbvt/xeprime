import { SUPPORT_CAPABILITY } from '@xeprime/types';
import { DocumentsSection } from '@/features/vehicle-manage/components/sections/DocumentsSection';
import { SupportRoute } from '@/features/tenant-support/components/SupportWorkspaceGate';

/** Giấy tờ xe trong phiên — thêm/cập nhật, KHÔNG xem chi tiết/file (ADR 0050 §13). */
export default function Page() {
  return (
    <SupportRoute requires={SUPPORT_CAPABILITY.VEHICLE_DOCUMENT_MANAGE}>
      <DocumentsSection />
    </SupportRoute>
  );
}
