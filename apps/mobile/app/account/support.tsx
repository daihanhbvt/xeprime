import { RequireSession } from '@/features/auth/RequireSession';
import { SUPPORT_SURFACE } from '@/features/support-cases/api';
import { SupportCasesScreen } from '@/features/support-cases/SupportCasesScreen';

/**
 * Yêu cầu hỗ trợ của CHÍNH người dùng — khác `/support` công khai của chợ xe (hướng dẫn + câu hỏi
 * thường gặp). Ở đây mỗi yêu cầu có mã theo dõi và một dòng thời gian.
 */
export default function AccountSupportRoute() {
  return (
    <RequireSession>
      <SupportCasesScreen surface={SUPPORT_SURFACE.CUSTOMER} />
    </RequireSession>
  );
}
