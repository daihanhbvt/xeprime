import type { components } from '@xeprime/types';

/** Shape phiếu thu/chi + danh mục lấy từ contract OpenAPI (ADR 0007) — không viết tay lại DTO. */
type Schemas = components['schemas'];

export type Receipt = Schemas['ReceiptListItemDto'];
export type ReceiptDetail = Schemas['ReceiptDetailDto'];
export type CreateReceiptInput = Schemas['CreateReceiptDto'];
export type FinanceCategory = Schemas['FinanceCategoryDto'];
export type CreateCategoryInput = Schemas['CreateCategoryDto'];
export type DebtItem = Schemas['DebtItemDto'];
export type FinanceSummary = Schemas['FinanceSummaryDto'];

/** Filter công nợ ở URL searchParams (ADR 0004). */
export interface DebtFilters {
  filter?: string;
  page?: number;
  limit?: number;
}

/** Filter danh sách phiếu — ở URL searchParams (ADR 0004). */
export interface ReceiptFilters {
  type?: string;
  status?: string;
  categoryId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}
