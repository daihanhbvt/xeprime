'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { PERMISSION, PLAN_FEATURE } from '@xeprime/types';
import { queryKeys } from '@/services/query-keys';
import type { ReceiptListResult } from '@/features/finance/api';
import type { FinanceSummary } from '@/features/finance/types';
import { useFeature } from '@/hooks/use-feature';
import { usePermissions } from '@/hooks/use-permissions';
import {
  dashboardFinanceSummaryParams,
  dashboardTodayReceiptParams,
  fetchDashboardFinanceSummary,
  fetchDashboardTodayReceipts,
} from '../api';

export interface DashboardMoney {
  /**
   * Có được hiện khối tiền không — HAI trục kiểm NỐI TIẾP (ADR 0027 điều 2):
   * gói có tính năng `finance` (`read_only` vẫn tính là có — không ai mất quyền xem sổ của
   * chính mình vì hết hạn gói, ADR 0027 điều 3), VÀ vai người đang đăng nhập có `finance.view`.
   *
   * Đây chỉ là lớp trải nghiệm; `/finance/summary` và `/receipts` đã có `@RequiresFeature`
   * + `@RequirePermissions` ở server (ADR 0027 điều 4).
   */
  visible: boolean;
  summary: UseQueryResult<FinanceSummary>;
  todayReceipts: UseQueryResult<ReceiptListResult>;
}

/**
 * Tiền thật của dashboard: doanh thu THÁNG NÀY, cọc đang giữ, và sổ quỹ HÔM NAY.
 *
 * Bậc cơ bản không có sổ tổng hợp (ADR 0027 điều 1) — khi đó `visible` là `false` và hai truy
 * vấn KHÔNG chạy, thay vì chạy rồi nuốt 403. `enabled` là chỗ duy nhất quyết định điều đó, nên
 * không có đường nào để một thẻ tiền hiện lên với dữ liệu rỗng mà trông như "chưa có doanh thu".
 */
export function useDashboardMoney(): DashboardMoney {
  const finance = useFeature(PLAN_FEATURE.FINANCE);
  const { has } = usePermissions();
  const visible = finance.isVisible && has(PERMISSION.FINANCE_VIEW);

  const summary = useQuery({
    queryKey: queryKeys.finance.summary(dashboardFinanceSummaryParams()),
    queryFn: fetchDashboardFinanceSummary,
    enabled: visible,
    staleTime: 60_000,
  });

  const todayReceipts = useQuery({
    queryKey: queryKeys.receipts.list(dashboardTodayReceiptParams()),
    queryFn: fetchDashboardTodayReceipts,
    enabled: visible,
    staleTime: 60_000,
  });

  return { visible, summary, todayReceipts };
}
