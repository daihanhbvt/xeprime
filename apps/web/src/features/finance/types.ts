import type { components } from '@xeprime/types';

/** Shape phiếu thu/chi + danh mục lấy từ contract OpenAPI (ADR 0007) — không viết tay lại DTO. */
type Schemas = components['schemas'];

export type Receipt = Schemas['ReceiptListItemDto'];
export type ReceiptDetail = Schemas['ReceiptDetailDto'];
export type CreateReceiptInput = Schemas['CreateReceiptDto'];
export type ReceiptSummary = Schemas['ReceiptSummaryDto'];
export type ReceiptBookingOption = Schemas['ReceiptBookingOptionDto'];
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

/**
 * Filter danh sách phiếu — ở URL searchParams (ADR 0004).
 *
 * `bookingId`/`vehicleId`/`tenantCustomerId` không có ô điều khiển riêng trên thanh lọc: chúng là
 * đường VÀO từ chi tiết đơn / hồ sơ xe / sổ khách. Vẫn phải nằm ở đây để URL đó chia sẻ được và
 * sống sót qua reload.
 */
export interface ReceiptFilters {
  type?: string;
  status?: string;
  categoryId?: string;
  source?: string;
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
