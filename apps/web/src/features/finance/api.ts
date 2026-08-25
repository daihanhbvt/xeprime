import {
  apiGet,
  apiPatch,
  apiPost,
  fetchPage,
  type Paged,
  type QueryParams,
} from '@/services/api-client';
import { apiDelete } from '@/services/api-client';
import { RECEIPTS_DEFAULT_LIMIT } from './constants';
import type {
  CreateCategoryInput,
  CreateReceiptInput,
  CustomerRevenue,
  DebtFilters,
  DebtItem,
  FinanceCategory,
  FinanceSummary,
  Receipt,
  ReceiptDetail,
  ReceiptFilters,
  ReceiptBookingOption,
  ReceiptVehicleOption,
  ReceiptSummary,
  FinanceCategoryBreakdown,
  FinanceOverviewFilters,
  FinancePeriodFilters,
  FinanceScope,
  FinanceSeries,
  VehicleProfit,
} from './types';

export type ReceiptListResult = Paged<Receipt>;

export function filtersToParams(filters: ReceiptFilters): QueryParams {
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
 * mới cho một con số không đổi, tức bốn thẻ nhấp nháy mỗi lần bấm sang trang.
 */
export function summaryParams(filters: ReceiptFilters): QueryParams {
  const { page: _page, limit: _limit, ...rest } = filtersToParams(filters);
  return rest;
}

export const fetchReceipts = (filters: ReceiptFilters): Promise<ReceiptListResult> =>
  fetchPage<Receipt>('/receipts', filtersToParams(filters), RECEIPTS_DEFAULT_LIMIT);

export const fetchReceipt = (id: string): Promise<ReceiptDetail> =>
  apiGet<ReceiptDetail>(`/receipts/${id}`);

/** Thẻ tổng của ĐÚNG bộ lọc đang xem — backend cộng cùng một vị từ với danh sách. */
export const fetchReceiptSummary = (filters: ReceiptFilters): Promise<ReceiptSummary> =>
  apiGet<ReceiptSummary>('/receipts/summary', summaryParams(filters));

/** Đơn gợi ý cho ô "Liên kết đơn thuê" — server đã sắp đơn còn nợ lên trước. */
export const fetchBookingOptions = (q?: string): Promise<ReceiptBookingOption[]> =>
  apiGet<ReceiptBookingOption[]>('/receipts/booking-options', { q: q?.trim() || null });

/**
 * Xe gợi ý cho ô "Liên kết xe". `includeId` giữ xe đang chọn sẵn trong kết quả kể cả khi nó
 * không khớp từ khoá đang gõ — không có nó, gõ tìm xe khác sẽ làm ô chọn hiện lại id thô.
 */
export const fetchVehicleOptions = (q?: string, includeId?: string | null): Promise<ReceiptVehicleOption[]> =>
  apiGet<ReceiptVehicleOption[]>('/receipts/vehicle-options', {
    q: q?.trim() || null,
    includeId: includeId || null,
  });

export const createReceipt = (body: CreateReceiptInput): Promise<ReceiptDetail> =>
  apiPost<ReceiptDetail>('/receipts', body);

export const approveReceipt = (id: string): Promise<ReceiptDetail> =>
  apiPost<ReceiptDetail>(`/receipts/${id}/approve`);

export const cancelReceipt = (id: string, reason?: string): Promise<ReceiptDetail> =>
  apiPost<ReceiptDetail>(`/receipts/${id}/cancel`, { reason });

export const fetchCategories = (type?: string): Promise<FinanceCategory[]> =>
  apiGet<FinanceCategory[]>('/finance/categories', type ? { type } : undefined);

export const createCategory = (body: CreateCategoryInput): Promise<FinanceCategory> =>
  apiPost<FinanceCategory>('/finance/categories', body);

/** Đổi tên danh mục của gian hàng — endpoint đã có từ Phase 6, FE trước nay chưa gọi. */
export const updateCategory = (id: string, name: string): Promise<FinanceCategory> =>
  apiPatch<FinanceCategory>(`/finance/categories/${id}`, { name });

export const deleteCategory = (id: string): Promise<void> =>
  apiDelete<void>(`/finance/categories/${id}`);

// --- Công nợ + dashboard ---------------------------------------------------

export type DebtListResult = Paged<DebtItem>;

export function debtFiltersToParams(filters: DebtFilters): QueryParams {
  return {
    q: filters.q ?? null,
    filter: filters.filter ?? null,
    page: filters.page ?? 1,
    limit: filters.limit ?? RECEIPTS_DEFAULT_LIMIT,
  };
}

export const fetchDebts = (filters: DebtFilters): Promise<DebtListResult> =>
  fetchPage<DebtItem>('/debts', debtFiltersToParams(filters), RECEIPTS_DEFAULT_LIMIT);

export const fetchFinanceSummary = (
  filters: FinancePeriodFilters,
  scope?: FinanceScope,
): Promise<FinanceSummary> =>
  apiGet<FinanceSummary>('/finance/summary', overviewRangeParams(filters, scope));

// --- Báo cáo doanh thu -----------------------------------------------------

/**
 * Ba endpoint báo cáo cùng nhận `from`/`to`; mỗi cái thêm đúng tham số của riêng nó.
 *
 * Tách hàm dựng tham số ra khỏi hàm gọi để query key và request dùng CHUNG một object — key lệch
 * tham số là cách sinh ra cache không bao giờ trúng, và người dùng thấy spinner mỗi lần bấm.
 */
export function overviewRangeParams(
  filters: FinancePeriodFilters,
  scope: FinanceScope = {},
): QueryParams {
  return {
    from: filters.from ?? null,
    to: filters.to ?? null,
    // Phạm vi đi CÙNG bộ tham số kỳ, không tách riêng: khoá cache và request phải dựng từ đúng
    // một object, nếu không hồ sơ xe A sẽ đọc trúng cache của xe B.
    vehicleId: scope.vehicleId ?? null,
    tenantCustomerId: scope.tenantCustomerId ?? null,
  };
}

export const fetchFinanceSeries = (
  filters: FinancePeriodFilters,
  scope?: FinanceScope,
): Promise<FinanceSeries> =>
  apiGet<FinanceSeries>('/finance/series', {
    ...overviewRangeParams(filters, scope),
    granularity: filters.granularity ?? null,
  });

export const fetchFinanceByCategory = (
  filters: FinancePeriodFilters,
  type: string,
  scope?: FinanceScope,
): Promise<FinanceCategoryBreakdown> =>
  apiGet<FinanceCategoryBreakdown>('/finance/by-category', {
    ...overviewRangeParams(filters, scope),
    type,
  });

export type VehicleProfitResult = Paged<VehicleProfit>;

export function vehicleProfitParams(filters: FinanceOverviewFilters): QueryParams {
  return {
    ...overviewRangeParams(filters),
    sort: filters.sort ?? null,
    page: filters.page ?? 1,
    limit: filters.limit ?? RECEIPTS_DEFAULT_LIMIT,
  };
}

export const fetchVehicleProfit = (filters: FinanceOverviewFilters): Promise<VehicleProfitResult> =>
  fetchPage<VehicleProfit>('/finance/by-vehicle', vehicleProfitParams(filters), RECEIPTS_DEFAULT_LIMIT);

export type CustomerRevenueResult = Paged<CustomerRevenue>;

/**
 * Bảng doanh thu theo khách có phân trang/sắp xếp RIÊNG với bảng theo xe.
 *
 * Trên URL chúng mang tiền tố khác nhau (`customerSort`/`customerPage`), nhưng xuống API thì cả
 * hai đều là `sort`/`page` — tiền tố là chuyện của một trang có hai bảng, không phải của endpoint.
 */
export function customerRevenueParams(filters: FinanceOverviewFilters): QueryParams {
  return {
    from: filters.from ?? null,
    to: filters.to ?? null,
    sort: filters.customerSort ?? null,
    page: filters.customerPage ?? 1,
    limit: filters.customerLimit ?? RECEIPTS_DEFAULT_LIMIT,
  };
}

export const fetchCustomerRevenue = (
  filters: FinanceOverviewFilters,
): Promise<CustomerRevenueResult> =>
  fetchPage<CustomerRevenue>(
    '/finance/by-customer',
    customerRevenueParams(filters),
    RECEIPTS_DEFAULT_LIMIT,
  );
