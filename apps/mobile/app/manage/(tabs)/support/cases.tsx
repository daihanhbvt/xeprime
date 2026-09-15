import { SUPPORT_SURFACE } from '@/features/support-cases/api';
import { SupportCasesScreen } from '@/features/support-cases/SupportCasesScreen';

/**
 * Yêu cầu hỗ trợ của GIAN HÀNG — tranh chấp, sự cố, hỏi tiền.
 *
 * Bộ CƠ BẢN (ADR 0027 điều 1): tranh chấp có hệ quả TIỀN (nó tạm giữ việc chốt khoản giữ chỗ của
 * chuyến), nên KHÔNG được khoá sau một cờ gói. Chỉ gác bằng quyền — và màn tự gác, đúng khuôn
 * các màn quản lý khác của app.
 */
export default function ManageSupportCasesRoute() {
  return <SupportCasesScreen surface={SUPPORT_SURFACE.TENANT} />;
}
