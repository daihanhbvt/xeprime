import type { components } from '@xeprime/types';

/** Type khách thuê toàn hệ thống (admin nền tảng) lấy từ contract OpenAPI (ADR 0007). */
type Schemas = components['schemas'];

export type AdminCustomer = Schemas['PlatformCustomerDto'];
export type AdminCustomerDetail = Schemas['PlatformCustomerDetailDto'];
export type AdminCustomerRequest = Schemas['PlatformCustomerRequestDto'];
export type CustomerContact = Schemas['CustomerContactDto'];

/** Filter danh sách khách — ở URL searchParams (ADR 0004). */
export interface AdminCustomerFilters {
  q?: string;
  phone?: string;
  email?: string;
  status?: string;
  hasRequests?: boolean;
  page?: number;
  limit?: number;
}
