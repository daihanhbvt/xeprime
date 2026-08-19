import type { PaginationMeta } from '@xeprime/types';
import { apiGet, apiPatch, apiPost, apiRequest, type QueryParams } from '@/services/api-client';
import { apiDelete } from '@/services/api-client';
import { RECEIPTS_DEFAULT_LIMIT } from './constants';
import type {
  CreateCategoryInput,
  CreateReceiptInput,
  DebtFilters,
  DebtItem,
  FinanceCategory,
  FinanceSummary,
  Receipt,
  ReceiptDetail,
  ReceiptFilters,
  ReceiptBookingOption,
  ReceiptSummary,
} from './types';

export interface ReceiptListResult {
  items: Receipt[];
  meta: PaginationMeta;
}

export function filtersToParams(filters: ReceiptFilters): QueryParams {
  return {
    type: filters.type ?? null,
    status: filters.status ?? null,
    categoryId: filters.categoryId ?? null,
    source: filters.source ?? null,
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

export async function fetchReceipts(filters: ReceiptFilters): Promise<ReceiptListResult> {
  const res = await apiRequest<Receipt[]>('/receipts', { query: filtersToParams(filters) });
  return {
    items: res.data,
    meta: (res.meta as PaginationMeta | undefined) ?? {
      page: 1,
      limit: RECEIPTS_DEFAULT_LIMIT,
      total: res.data.length,
      hasNext: false,
    },
  };
}

export const fetchReceipt = (id: string): Promise<ReceiptDetail> =>
  apiGet<ReceiptDetail>(`/receipts/${id}`);

/** Thẻ tổng của ĐÚNG bộ lọc đang xem — backend cộng cùng một vị từ với danh sách. */
export const fetchReceiptSummary = (filters: ReceiptFilters): Promise<ReceiptSummary> =>
  apiGet<ReceiptSummary>('/receipts/summary', summaryParams(filters));

/** Đơn gợi ý cho ô "Liên kết đơn thuê" — server đã sắp đơn còn nợ lên trước. */
export const fetchBookingOptions = (q?: string): Promise<ReceiptBookingOption[]> =>
  apiGet<ReceiptBookingOption[]>('/receipts/booking-options', { q: q?.trim() || null });

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

export interface DebtListResult {
  items: DebtItem[];
  meta: PaginationMeta;
}

export function debtFiltersToParams(filters: DebtFilters): QueryParams {
  return {
    filter: filters.filter ?? null,
    page: filters.page ?? 1,
    limit: filters.limit ?? RECEIPTS_DEFAULT_LIMIT,
  };
}

export async function fetchDebts(filters: DebtFilters): Promise<DebtListResult> {
  const res = await apiRequest<DebtItem[]>('/debts', { query: debtFiltersToParams(filters) });
  return {
    items: res.data,
    meta: (res.meta as PaginationMeta | undefined) ?? {
      page: 1,
      limit: RECEIPTS_DEFAULT_LIMIT,
      total: res.data.length,
      hasNext: false,
    },
  };
}

export const fetchFinanceSummary = (from?: string, to?: string): Promise<FinanceSummary> =>
  apiGet<FinanceSummary>('/finance/summary', { from: from ?? null, to: to ?? null });
