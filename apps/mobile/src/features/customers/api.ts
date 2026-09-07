// Side-effect import, KHÔNG xoá: nạp module này là lúc client mặc định được cấu hình.
import '@/lib/api-client';

export {
  customersApi,
  customerFiltersToParams,
  duplicateCustomerId,
  CUSTOMERS_DEFAULT_LIMIT,
  CUSTOMER_HISTORY_DEFAULT_LIMIT,
} from '@xeprime/api-client';

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
