import type { components } from '@xeprime/types';
import { getApiClient, type Paged } from '../../client';
import type { QueryParams } from '../../url';

type Schemas = components['schemas'];

export type Receipt = Schemas['ReceiptListItemDto'];
export type ReceiptDetail = Schemas['ReceiptDetailDto'];
export type ReceiptSummary = Schemas['ReceiptSummaryDto'];
export type FinanceSummary = Schemas['FinanceSummaryDto'];
export type FinanceSeries = Schemas['FinanceSeriesDto'];
export type FinanceSeriesBucket = Schemas['FinanceSeriesBucketDto'];

export const RECEIPTS_DEFAULT_LIMIT = 20;

/**
 * Bộ lọc sổ Thu-Chi.
 *
 * `bookingId`/`vehicleId`/`tenantCustomerId` không có ô điều khiển riêng trên thanh lọc: chúng
 * là đường VÀO từ chi tiết đơn / hồ sơ xe / sổ khách.
 *
 * Ý ĐỊNH của giao diện (web đặt `create=1` lên URL để mở sẵn form) KHÔNG nằm ở đây — nó không
 * xuống API, nên nó thuộc về client dựng ra nó.
 */
export interface ReceiptFilters {
  type?: string;
  status?: string;
  categoryId?: string;
  source?: string;
  /** Nhóm nguồn: tiền thật của gian hàng ↔ tiền giữ hộ. */
  sourceGroup?: string;
  paymentMethod?: string;
  bookingId?: string;
  vehicleId?: string;
  tenantCustomerId?: string;
  q?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export function receiptFiltersToParams(filters: ReceiptFilters): QueryParams {
  return {
    type: filters.type ?? null,
    status: filters.status ?? null,
    categoryId: filters.categoryId ?? null,
    source: filters.source ?? null,
    sourceGroup: filters.sourceGroup ?? null,
    paymentMethod: filters.paymentMethod ?? null,
    bookingId: filters.bookingId ?? null,
    vehicleId: filters.vehicleId ?? null,
    tenantCustomerId: filters.tenantCustomerId ?? null,
    q: filters.q ?? null,
    from: filters.from ?? null,
    to: filters.to ?? null,
    page: filters.page ?? 1,
    limit: filters.limit ?? RECEIPTS_DEFAULT_LIMIT,
  };
}

/**
 * Tham số cho thẻ tổng: CÙNG bộ lọc với danh sách, bỏ phân trang.
 *
 * Bỏ `page`/`limit` không phải để gọn — giữ chúng lại thì mỗi lần sang trang là một query key
 * mới cho một con số không đổi, tức các thẻ nhấp nháy mỗi lần bấm sang trang.
 */
export function receiptSummaryParams(filters: ReceiptFilters): QueryParams {
  const { page: _page, limit: _limit, ...rest } = receiptFiltersToParams(filters);
  return rest;
}

/** KỲ của mọi bề mặt tiền theo kỳ — hai đầu `YYYY-MM-DD` + độ mịn biểu đồ. */
export interface FinancePeriodFilters {
  from?: string;
  to?: string;
  granularity?: string;
}

/**
 * Thu hẹp một báo cáo về MỘT thực thể.
 *
 * Đúng MỘT khoá được đặt — panel không dựng để cắt hai chiều cùng lúc, và một giao điểm
 * "xe X của khách Y" là câu hỏi khác hẳn.
 */
export interface FinanceScope {
  vehicleId?: string;
  tenantCustomerId?: string;
}

/**
 * Phạm vi đi CÙNG bộ tham số kỳ, không tách riêng: khoá cache và request phải dựng từ đúng một
 * object, nếu không hồ sơ khách A sẽ đọc trúng cache của khách B.
 */
export function financeRangeParams(
  filters: FinancePeriodFilters,
  scope: FinanceScope = {},
): QueryParams {
  return {
    from: filters.from ?? null,
    to: filters.to ?? null,
    vehicleId: scope.vehicleId ?? null,
    tenantCustomerId: scope.tenantCustomerId ?? null,
  };
}

export function financeSeriesParams(
  filters: FinancePeriodFilters,
  scope: FinanceScope = {},
): QueryParams {
  return { ...financeRangeParams(filters, scope), granularity: filters.granularity ?? null };
}

export const receiptsApi = {
  list(filters: ReceiptFilters): Promise<Paged<Receipt>> {
    return getApiClient().fetchPage<Receipt>(
      '/receipts',
      receiptFiltersToParams(filters),
      RECEIPTS_DEFAULT_LIMIT,
    );
  },

  detail(id: string): Promise<ReceiptDetail> {
    return getApiClient().get<ReceiptDetail>(`/receipts/${encodeURIComponent(id)}`);
  },

  /** Thẻ tổng của ĐÚNG bộ lọc đang xem — backend cộng cùng một vị từ với danh sách. */
  summary(filters: ReceiptFilters): Promise<ReceiptSummary> {
    return getApiClient().get<ReceiptSummary>('/receipts/summary', receiptSummaryParams(filters));
  },
};

/**
 * Báo cáo tiền theo KỲ — dùng lại nguyên bộ endpoint của màn Tổng quan doanh thu, chỉ thêm mệnh
 * đề thu hẹp `scope`. Đó là điều làm cho con số ở hồ sơ một khách và con số ở bảng tổng quan
 * **không thể lệch nhau**: chúng là cùng một câu truy vấn.
 */
export const financeApi = {
  summary(filters: FinancePeriodFilters, scope?: FinanceScope): Promise<FinanceSummary> {
    return getApiClient().get<FinanceSummary>('/finance/summary', financeRangeParams(filters, scope));
  },

  series(filters: FinancePeriodFilters, scope?: FinanceScope): Promise<FinanceSeries> {
    return getApiClient().get<FinanceSeries>('/finance/series', financeSeriesParams(filters, scope));
  },
};
