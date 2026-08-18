import type { components } from '@xeprime/types';

/** Shape lấy từ contract OpenAPI (ADR 0007) — KHÔNG viết tay lại DTO của backend. */
type Schemas = components['schemas'];

export type TenantCustomer = Schemas['TenantCustomerListItemDto'];
export type TenantCustomerDetail = Schemas['TenantCustomerDetailDto'];
export type TenantCustomerSummary = Schemas['TenantCustomerSummaryDto'];
export type CreateTenantCustomerInput = Schemas['CreateTenantCustomerDto'];
export type UpdateTenantCustomerInput = Schemas['UpdateTenantCustomerDto'];
export type UpdateCustomerRiskInput = Schemas['UpdateCustomerRiskDto'];
export type CustomerBooking = Schemas['CustomerBookingItemDto'];
export type CustomerNote = Schemas['CustomerNoteDto'];
export type CreateCustomerNoteInput = Schemas['CreateCustomerNoteDto'];
export type CustomerDocument = Schemas['CustomerDocumentDto'];
export type CustomerDocumentPresign = Schemas['CustomerDocumentPresignDto'];
export type CustomerDocumentDownload = Schemas['CustomerDocumentDownloadDto'];

/**
 * Bộ lọc của danh sách — sống ở URL searchParams (ADR 0004), nên mọi trường là chuỗi/số đặt
 * được lên query string. KHÔNG có trong contract vì đó là trạng thái của MÀN HÌNH, không phải
 * của API.
 */
export interface CustomerFilters {
  q?: string;
  relationship?: string;
  sort?: string;
  page?: number;
  limit?: number;
}

/**
 * `details` của lỗi 409 trùng SĐT — backend trả id hồ sơ đang giữ số đó để UI mở thẳng hồ sơ ấy
 * thay vì bắt người dùng đi tìm. Không có trong contract (OpenAPI không mô tả `details`).
 */
export interface DuplicatePhoneDetails {
  customerId?: string;
}
