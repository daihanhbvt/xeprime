import type { components } from '@xeprime/types';

/**
 * Kiểu của sổ khách — bản của WEB.
 *
 * Shape alias thẳng từ contract OpenAPI (ADR 0007), KHÔNG viết tay lại DTO. ADR 0031: app native
 * có bản riêng ở `apps/mobile/src/api/customers/api.ts`; đổi DTO sổ khách thì sửa CẢ HAI.
 */
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
export type VerifyCustomerDocumentInput = Schemas['VerifyCustomerDocumentDto'];
export type PresignCustomerDocumentInput = Schemas['PresignCustomerDocumentDto'];

/**
 * Bộ lọc của danh sách khách.
 *
 * KHÔNG có trong contract vì đó là trạng thái của MÀN HÌNH, không phải của API — web đặt nó lên
 * URL searchParams (ADR 0004).
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
