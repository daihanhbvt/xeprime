'use client';

import { useQuery } from '@tanstack/react-query';
import { PERMISSION } from '@xeprime/types';
import { useDriverLicenceCounts } from '@/features/admin-driver-licences/hooks/use-admin-driver-licences';
import { useMoneySummary } from '@/features/platform-money/hooks/use-platform-money';
import { fetchSupportCases, filtersToParams } from '@/features/support-cases/api';
import { SUPPORT_SURFACE, type SupportCaseFilters } from '@/features/support-cases/types';
import { usePermissions } from '@/hooks/use-permissions';
import { queryKeys } from '@/services/query-keys';
import { usePlatformSummary } from './use-platform-summary';

/**
 * Bộ lọc của phép ĐẾM khiếu nại đang mở: không gửi `status` — server tự hiểu là "mọi trạng thái
 * còn mở", đúng hàng đợi mặc định của màn Hỗ trợ. `limit: 1` vì chỉ cần `meta.total`.
 */
const OPEN_CASES_COUNT: SupportCaseFilters = { page: 1, limit: 1 };

/**
 * Các hàng đợi việc của người trực nền tảng — MỖI hàng đợi đọc đúng endpoint đếm của chính nó và
 * gác bằng đúng quyền của chính nó (cùng quyền với màn mà ô dẫn tới). Không có endpoint "đếm tất
 * cả" thứ hai: con số trên ô và con số trên màn hàng đợi phải là một phép đếm.
 *
 * Thiếu quyền ⇒ truy vấn của hàng đợi đó KHÔNG chạy và ô vắng hẳn (reviewer không thấy ô tiền,
 * finance không thấy ô bằng lái) — ẩn nút không phải kiểm soát quyền, guard API mới là cổng thật.
 */
export function usePlatformQueues() {
  const { has } = usePermissions();
  const can = {
    vehicles: has(PERMISSION.PLATFORM_APPROVAL_REVIEW),
    licences: has(PERMISSION.PLATFORM_DRIVER_LICENCE_REVIEW),
    money: has(PERMISSION.PLATFORM_MONEY_MANAGE),
    cases: has(PERMISSION.PLATFORM_SUPPORT_MANAGE),
  };

  const summary = usePlatformSummary();
  const licences = useDriverLicenceCounts(can.licences);
  const money = useMoneySummary({ enabled: can.money });
  const cases = useQuery({
    queryKey: queryKeys.supportCases.list(filtersToParams(SUPPORT_SURFACE.PLATFORM, OPEN_CASES_COUNT)),
    queryFn: () => fetchSupportCases(SUPPORT_SURFACE.PLATFORM, OPEN_CASES_COUNT),
    enabled: can.cases,
    select: (page) => page.meta.total,
  });

  return { can, summary, licences, money, cases };
}
