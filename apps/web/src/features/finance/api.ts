import type { PaginationMeta } from '@xeprime/types';
import { apiGet, apiPost, apiRequest, type QueryParams } from '@/services/api-client';
import { apiDelete } from '@/services/api-client';
import { RECEIPTS_DEFAULT_LIMIT } from './constants';
import type {
  CreateCategoryInput,
  CreateReceiptInput,
  FinanceCategory,
  Receipt,
  ReceiptDetail,
  ReceiptFilters,
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
    from: filters.from ?? null,
    to: filters.to ?? null,
    page: filters.page ?? 1,
    limit: filters.limit ?? RECEIPTS_DEFAULT_LIMIT,
  };
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

export const deleteCategory = (id: string): Promise<void> =>
  apiDelete<void>(`/finance/categories/${id}`);
