import {
  fetchFinanceSeries,
  fetchFinanceSummary,
  fetchReceipts,
  filtersToParams,
  overviewRangeParams,
  type ReceiptListResult,
} from '@/features/finance/api';
import type { FinanceSeries, FinancePeriodFilters, FinanceSummary, ReceiptFilters } from '@/features/finance/types';
import { apiGet, type QueryParams } from '@/services/api-client';
import { DAY_PARAM_FORMAT, buildPeriodRange, nowInAppTz } from '@/lib/datetime';
import { FINANCE_GRANULARITY } from '@xeprime/types';
import type { PartnerOverview } from './types';

// ── Tổng quan (một request cho phần vận hành) ────────────────────────────────────────────────

/**
 * Tham số của `GET /dashboard/overview` — dùng CHUNG cho request và query key (key lệch request
 * một trường là hai bản cache cho cùng một câu hỏi). `null` để tham số vắng hẳn khỏi URL.
 */
export const partnerOverviewParams = (branchId?: string): QueryParams => ({
  branchId: branchId ?? null,
});

/**
 * Việc giao/nhận, yêu cầu chờ duyệt, lịch 7 ngày, tháng này so cùng kỳ, xe trên chợ, uy tín —
 * cả hai tuyến. Tiền KHÔNG ở đây: tuyến gói đọc sổ thu chi, chủ xe đọc sổ ví (mỗi con số một
 * nguồn). Khối thiếu quyền về `null` — nơi hiển thị ẩn khối đó, không vẽ số 0.
 */
export const fetchPartnerOverview = (branchId?: string): Promise<PartnerOverview> =>
  apiGet<PartnerOverview>('/dashboard/overview', partnerOverviewParams(branchId));

// ── Tiền của tuyến gói (sổ thu chi) ──────────────────────────────────────────────────────────

/** Số dòng phiếu thu/chi hiện trong panel "Thu Chi hôm nay" — panel là bản xem nhanh, không phải sổ. */
export const DASHBOARD_RECEIPT_LIMIT = 5;

/** Số ngày của biểu đồ doanh thu trên Tổng quan — gồm cả hôm nay. */
export const DASHBOARD_REVENUE_DAYS = 30;

/**
 * Kỳ của thẻ "Doanh thu" trên dashboard: THÁNG NÀY theo giờ Việt Nam.
 *
 * Đi qua `buildPeriodRange` chứ không tự dựng `dayjs().startOf('month')`: cùng một hàm với
 * bộ lọc kỳ ở màn Tổng quan doanh thu, nên hai bề mặt không thể hiểu "tháng này" lệch nhau
 * một ngày ở biên múi giờ.
 */
export const dashboardMonthRange = (): { from: string; to: string } =>
  buildPeriodRange('this_month');

/**
 * CÙNG KỲ tháng trước: từ ngày 1 tới đúng ngày-trong-tháng của hôm nay, lùi một tháng.
 *
 * So doanh thu mười ngày đầu tháng với cả tháng trước là vẽ ra một cú sụt không có thật. `dayjs`
 * tự kẹp ngày khi lùi tháng (31/03 → 28/02), nên kỳ so sánh không bao giờ tràn sang tháng này.
 * Cùng quy ước với các con số "so cùng kỳ" do server tính (`PartnerDashboardMonthDto`).
 */
export const dashboardPreviousMonthToDateRange = (): { from: string; to: string } => {
  const sameDayLastMonth = nowInAppTz().subtract(1, 'month');
  return {
    from: sameDayLastMonth.startOf('month').format(DAY_PARAM_FORMAT),
    to: sameDayLastMonth.format(DAY_PARAM_FORMAT),
  };
};

/** Kỳ của panel "Thu Chi hôm nay" — trọn ngày hôm nay theo giờ Việt Nam. */
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

/**
 * Ba lớp tiền của tháng này — CÙNG endpoint với màn Tổng quan doanh thu.
 *
 * Dùng lại `fetchFinanceSummary` thay vì thêm một endpoint "dashboard summary": hai bề mặt
 * cộng cùng một phép tính thì không được có hai đường tính. Thẻ trên dashboard và thẻ trên
 * báo cáo phải nói cùng một con số cho cùng một kỳ.
 */
export const fetchDashboardFinanceSummary = (branchId?: string): Promise<FinanceSummary> =>
  fetchFinanceSummary({ ...dashboardMonthRange(), branchId });

/** Cùng phép tính cho cùng kỳ tháng trước — mẫu số của mũi tên tăng/giảm trên thẻ doanh thu. */
export const fetchDashboardPreviousFinanceSummary = (branchId?: string): Promise<FinanceSummary> =>
  fetchFinanceSummary({ ...dashboardPreviousMonthToDateRange(), branchId });

export const fetchDashboardFinanceSeries = (branchId?: string): Promise<FinanceSeries> =>
  fetchFinanceSeries(dashboardRevenueSeriesFilters(branchId));

/** Bộ lọc của panel "Thu Chi hôm nay" — mọi trạng thái, để phiếu chờ duyệt cũng nhìn thấy được. */
export const dashboardTodayReceiptFilters = (branchId?: string): ReceiptFilters => ({
  ...dashboardTodayRange(),
  branchId,
  page: 1,
  limit: DASHBOARD_RECEIPT_LIMIT,
});

export const fetchDashboardTodayReceipts = (branchId?: string): Promise<ReceiptListResult> =>
  fetchReceipts(dashboardTodayReceiptFilters(branchId));

/*
 * Khoá cache của các truy vấn tiền trên dashboard.
 *
 * Dựng từ CHÍNH bộ tham số mà request gửi đi (`overviewRangeParams` / `filtersToParams`), không
 * gõ lại: khoá lệch request một trường là hai bản ghi cache cho cùng một câu hỏi, và một lần
 * `invalidateQueries` chỉ làm mới đúng một nửa. Chuỗi doanh thu dùng đúng khoá của
 * `useFinanceSeries` để màn Tổng quan doanh thu đọc trúng cache của dashboard và ngược lại.
 */
export const dashboardFinanceSummaryParams = (branchId?: string): QueryParams =>
  overviewRangeParams({ ...dashboardMonthRange(), branchId });

export const dashboardPreviousFinanceSummaryParams = (branchId?: string): QueryParams =>
  overviewRangeParams({ ...dashboardPreviousMonthToDateRange(), branchId });

export const dashboardFinanceSeriesParams = (branchId?: string): QueryParams => {
  const filters = dashboardRevenueSeriesFilters(branchId);
  return { ...overviewRangeParams(filters), granularity: filters.granularity ?? null };
};

export const dashboardTodayReceiptParams = (branchId?: string): QueryParams =>
  filtersToParams(dashboardTodayReceiptFilters(branchId));
