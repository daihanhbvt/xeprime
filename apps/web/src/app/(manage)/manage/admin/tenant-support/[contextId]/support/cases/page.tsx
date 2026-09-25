import { SUPPORT_CAPABILITY } from '@xeprime/types';
import { ShopSupportCasesPage } from '@/features/support-cases/components/ShopSupportCasesPage';
import { SupportRoute } from '@/features/tenant-support/components/SupportWorkspaceGate';

/** Case hỗ trợ/tranh chấp của gian hàng — CHÍNH `ShopSupportCasesPage`, chỉ đọc. */
export default function Page() {
  return (
    <SupportRoute requires={SUPPORT_CAPABILITY.SUPPORT_CASE_VIEW}>
      <ShopSupportCasesPage />
    </SupportRoute>
  );
}
