// Side-effect import, KHÔNG xoá: nạp module này là lúc client mặc định được cấu hình.
import '@/lib/api-client';

import { DAY_PARAM_FORMAT, buildPeriodRange, nowInAppTz } from '@xeprime/domain';
import { FINANCE_GRANULARITY } from '@xeprime/types';
import type { FinancePeriodFilters } from '@/features/finance/api';

export {
  dashboardApi,
  partnerOverviewParams,
  type PartnerAgendaItem,
  type PartnerOverview,
  type PartnerOverviewAgenda,
  type PartnerOverviewMarket,
  type PartnerOverviewMonth,
  type PartnerOverviewRequests,
  type PartnerOverviewToday,
  type PartnerTrendPoint,
} from '@/api/dashboard/api';

/**
 * Phần VẬN HÀNH của Tổng quan đi qua MỘT request (`GET /dashboard/overview`, PR #170). Phần TIỀN
 * vẫn compose từ chính endpoint của module nguồn (`/finance/summary`, `/finance/series`,
 * `/receipts`, sổ ví) — y như web: hai bề mặt cộng cùng một phép tính thì không được có hai
 * đường tính.
 */

/** Số dòng phiếu thu/chi hiện ở khối "Thu Chi hôm nay" — bản xem nhanh, không phải sổ. */
export const DASHBOARD_RECEIPT_LIMIT = 5;

/** Số ngày của biểu đồ doanh thu trên Tổng quan — gồm cả hôm nay. Cùng hằng với web. */
export const DASHBOARD_REVENUE_DAYS = 30;

/**
 * Kỳ của thẻ "Doanh thu": THÁNG NÀY theo giờ Việt Nam — qua `buildPeriodRange`, cùng hàm với bộ
 * lọc kỳ ở màn Tổng quan doanh thu.
 */
export const dashboardMonthRange = (): { from: string; to: string } => buildPeriodRange('this_month');

/**
 * CÙNG KỲ tháng trước: từ ngày 1 tới đúng ngày-trong-tháng của hôm nay, lùi một tháng. `dayjs` tự
 * kẹp ngày khi lùi tháng (31/03 → 28/02). Cùng quy ước với các số "so cùng kỳ" do server tính.
 */
export const dashboardPreviousMonthToDateRange = (): { from: string; to: string } => {
  const sameDayLastMonth = nowInAppTz().subtract(1, 'month');
  return {
    from: sameDayLastMonth.startOf('month').format(DAY_PARAM_FORMAT),
    to: sameDayLastMonth.format(DAY_PARAM_FORMAT),
  };
};

/** Kỳ của khối "Thu Chi hôm nay" — trọn ngày hôm nay theo giờ Việt Nam. */
export const dashboardTodayRange = (): { from: string; to: string } => buildPeriodRange('today');

/** Kỳ + độ mịn của biểu đồ doanh thu: `DASHBOARD_REVENUE_DAYS` ngày gần nhất, theo NGÀY. */
export const dashboardRevenueSeriesFilters = (branchId?: string): FinancePeriodFilters => {
  const today = nowInAppTz();
  return {
    from: today.subtract(DASHBOARD_REVENUE_DAYS - 1, 'day').format(DAY_PARAM_FORMAT),
    to: today.format(DAY_PARAM_FORMAT),
    granularity: FINANCE_GRANULARITY.DAY,
    branchId,
  };
};
