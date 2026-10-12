'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { PERMISSION, PLAN_FEATURE } from '@xeprime/types';
import { queryKeys } from '@/services/query-keys';
import type { ReceiptListResult } from '@/features/finance/api';
import type { FinanceSeries, FinanceSummary } from '@/features/finance/types';
import { useFeature } from '@/hooks/use-feature';
import { usePermissions } from '@/hooks/use-permissions';
import {
  dashboardFinanceSeriesParams,
  dashboardFinanceSummaryParams,
  dashboardPreviousFinanceSummaryParams,
  dashboardTodayReceiptParams,
  fetchDashboardFinanceSeries,
  fetchDashboardFinanceSummary,
  fetchDashboardPreviousFinanceSummary,
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
  /** Cùng phép tính, CÙNG KỲ tháng trước — mẫu số của mũi tên tăng/giảm. */
  previousSummary: UseQueryResult<FinanceSummary>;
  /** Doanh thu · chi phí · lợi nhuận theo ngày, 30 ngày gần nhất. */
  series: UseQueryResult<FinanceSeries>;
  todayReceipts: UseQueryResult<ReceiptListResult>;
}

/**
 * Tiền thật của dashboard tuyến gói: doanh thu THÁNG NÀY (và cùng kỳ tháng trước), cọc đang giữ,
 * chuỗi 30 ngày và sổ quỹ HÔM NAY — tất cả đọc từ sổ thu chi, cùng endpoint với màn Tổng quan
 * doanh thu.
 *
 * Bậc không có sổ tổng hợp (ADR 0027 điều 1) — khi đó `visible` là `false` và các truy vấn
 * KHÔNG chạy, thay vì chạy rồi nuốt 403. `enabled` là chỗ duy nhất quyết định điều đó, nên không
 * có đường nào để một thẻ tiền hiện lên với dữ liệu rỗng mà trông như "chưa có doanh thu".
 */
export function useDashboardMoney(branchId?: string): DashboardMoney {
  const finance = useFeature(PLAN_FEATURE.FINANCE);
  const { has } = usePermissions();
  const visible = finance.isVisible && has(PERMISSION.FINANCE_VIEW);

  const summary = useQuery({
    queryKey: queryKeys.finance.summary(dashboardFinanceSummaryParams(branchId)),
    queryFn: () => fetchDashboardFinanceSummary(branchId),
    enabled: visible,
    staleTime: 60_000,
  });

  const previousSummary = useQuery({
    queryKey: queryKeys.finance.summary(dashboardPreviousFinanceSummaryParams(branchId)),
    queryFn: () => fetchDashboardPreviousFinanceSummary(branchId),
    enabled: visible,
    // Quá khứ không đổi theo phút — chỉ một phiếu duyệt muộn mới làm nó nhúc nhích.
    staleTime: 5 * 60_000,
  });

  const series = useQuery({
    queryKey: queryKeys.finance.series(dashboardFinanceSeriesParams(branchId)),
    queryFn: () => fetchDashboardFinanceSeries(branchId),
    enabled: visible,
    staleTime: 60_000,
  });

  const todayReceipts = useQuery({
    queryKey: queryKeys.receipts.list(dashboardTodayReceiptParams(branchId)),
    queryFn: () => fetchDashboardTodayReceipts(branchId),
    enabled: visible,
    staleTime: 60_000,
  });

  return { visible, summary, previousSummary, series, todayReceipts };
}
