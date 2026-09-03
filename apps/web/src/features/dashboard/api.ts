import { fetchVehicles } from '@/features/vehicles/api';
import {
  fetchFinanceSummary,
  fetchReceipts,
  filtersToParams,
  overviewRangeParams,
  type ReceiptListResult,
} from '@/features/finance/api';
import type { FinanceSummary, ReceiptFilters } from '@/features/finance/types';
import type { QueryParams } from '@/services/api-client';
import { buildPeriodRange } from '@/lib/datetime';
import { VEHICLE_OPERATION_STATUS } from '@xeprime/types';

export interface VehicleStats {
  total: number;
  available: number;
  renting: number;
}

/**
 * Đếm xe theo tình trạng vận hành — mỗi số là `meta.total` của một truy vấn `limit=1`,
 * nên đếm ở server (chuẩn khi có phân trang) mà không kéo cả danh sách về.
 */
export async function fetchVehicleStats(): Promise<VehicleStats> {
  const [all, available, renting] = await Promise.all([
    fetchVehicles({ limit: 1 }),
    fetchVehicles({ operationStatus: VEHICLE_OPERATION_STATUS.AVAILABLE, limit: 1 }),
    fetchVehicles({ operationStatus: VEHICLE_OPERATION_STATUS.RENTING, limit: 1 }),
  ]);
  return {
    total: all.meta.total,
    available: available.meta.total,
    renting: renting.meta.total,
  };
}

/** Số dòng phiếu thu/chi hiện trong panel "Thu Chi hôm nay" — panel là bản xem nhanh, không phải sổ. */
export const DASHBOARD_RECEIPT_LIMIT = 5;

/**
 * Kỳ của thẻ "Doanh thu" trên dashboard: THÁNG NÀY theo giờ Việt Nam.
 *
 * Đi qua `buildPeriodRange` chứ không tự dựng `dayjs().startOf('month')`: cùng một hàm với
 * bộ lọc kỳ ở màn Tổng quan doanh thu, nên hai bề mặt không thể hiểu "tháng này" lệch nhau
 * một ngày ở biên múi giờ.
 */
export const dashboardMonthRange = (): { from: string; to: string } =>
  buildPeriodRange('this_month');

/** Kỳ của panel "Thu Chi hôm nay" — trọn ngày hôm nay theo giờ Việt Nam. */
export const dashboardTodayRange = (): { from: string; to: string } => buildPeriodRange('today');

/**
 * Ba lớp tiền của tháng này — CÙNG endpoint với màn Tổng quan doanh thu.
 *
 * Dùng lại `fetchFinanceSummary` thay vì thêm một endpoint "dashboard summary": hai bề mặt
 * cộng cùng một phép tính thì không được có hai đường tính. Thẻ trên dashboard và thẻ trên
 * báo cáo phải nói cùng một con số cho cùng một kỳ.
 */
export const fetchDashboardFinanceSummary = (): Promise<FinanceSummary> =>
  fetchFinanceSummary(dashboardMonthRange());

/** Bộ lọc của panel "Thu Chi hôm nay" — mọi trạng thái, để phiếu chờ duyệt cũng nhìn thấy được. */
export const dashboardTodayReceiptFilters = (): ReceiptFilters => ({
  ...dashboardTodayRange(),
  page: 1,
  limit: DASHBOARD_RECEIPT_LIMIT,
});

export const fetchDashboardTodayReceipts = (): Promise<ReceiptListResult> =>
  fetchReceipts(dashboardTodayReceiptFilters());

/*
 * Khoá cache của hai truy vấn tiền trên dashboard.
 *
 * Dựng từ CHÍNH bộ tham số mà request gửi đi (`overviewRangeParams` / `filtersToParams`), không
 * gõ lại: khoá lệch request một trường là hai bản ghi cache cho cùng một câu hỏi, và một lần
 * `invalidateQueries` chỉ làm mới đúng một nửa.
 */
export const dashboardFinanceSummaryParams = (): QueryParams =>
  overviewRangeParams(dashboardMonthRange());

export const dashboardTodayReceiptParams = (): QueryParams =>
  filtersToParams(dashboardTodayReceiptFilters());
