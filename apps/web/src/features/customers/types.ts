/**
 * Kiểu của sổ khách — TÁI XUẤT từ `@xeprime/api-client`.
 *
 * Shape gốc lấy từ contract OpenAPI (ADR 0007) và bộ lọc được serialize bằng ĐÚNG một hàm cho
 * cả web lẫn app native; giữ một bản khai riêng ở đây là mở đường cho hai client gửi hai bộ
 * query params khác nhau tới cùng một endpoint.
 */
export type {
  CreateCustomerNoteInput,
  CreateTenantCustomerInput,
  CustomerBooking,
  CustomerDocument,
  CustomerDocumentDownload,
  CustomerDocumentPresign,
  CustomerFilters,
  CustomerNote,
  DuplicatePhoneDetails,
  PresignCustomerDocumentInput,
  TenantCustomer,
  TenantCustomerDetail,
  TenantCustomerSummary,
  UpdateCustomerRiskInput,
  UpdateTenantCustomerInput,
  VerifyCustomerDocumentInput,
} from '@xeprime/api-client';
