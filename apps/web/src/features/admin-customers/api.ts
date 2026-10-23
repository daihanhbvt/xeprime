import { DEFAULT_PAGE_SIZE, pickFilter } from '@/constants/filters';
import { apiGet, apiPost, fetchPage, type Paged, type QueryParams } from '@/services/api-client';
import type {
  AdminCustomer,
  AdminCustomerDetail,
  AdminCustomerFilters,
  CustomerContact,
  CustomerLicence,
  CustomerLicenceImage,
} from './types';

export const ADMIN_CUSTOMERS_DEFAULT_LIMIT = DEFAULT_PAGE_SIZE;

export type AdminCustomerListResult = Paged<AdminCustomer>;

export function filtersToParams(filters: AdminCustomerFilters): QueryParams {
  return {
    q: filters.q ?? null,
    phone: filters.phone ?? null,
    email: filters.email ?? null,
    status: pickFilter(filters.status),
    hasRequests: filters.hasRequests ? 'true' : null,
    licence: pickFilter(filters.licence),
    page: filters.page ?? 1,
    limit: filters.limit ?? ADMIN_CUSTOMERS_DEFAULT_LIMIT,
  };
}

export const fetchAdminCustomers = (
  filters: AdminCustomerFilters,
): Promise<AdminCustomerListResult> =>
  fetchPage<AdminCustomer>(
    '/platform/customers',
    filtersToParams(filters),
    ADMIN_CUSTOMERS_DEFAULT_LIMIT,
  );

export const fetchAdminCustomer = (id: string): Promise<AdminCustomerDetail> =>
  apiGet<AdminCustomerDetail>(`/platform/customers/${id}`);

/** Bỏ che SĐT/email. Mỗi lần gọi là một dòng audit ở backend — không gọi ngầm/tự động. */
export const revealCustomerContact = (id: string): Promise<CustomerContact> =>
  apiPost<CustomerContact>(`/platform/customers/${id}/contact`);

/** Số lượt nộp bằng lái tối đa hiện trong hồ sơ — đủ cho mọi khách thật (trần nộp 10 lượt/ngày). */
export const CUSTOMER_LICENCE_HISTORY_LIMIT = 20;

/** Lịch sử nộp bằng lái của MỘT khách, mới nhất trước (ADR 0070 — chỉ đọc). */
export const fetchCustomerLicences = (userId: string): Promise<Paged<CustomerLicence>> =>
  fetchPage<CustomerLicence>(
    '/platform/driver-licences',
    { userId, page: 1, limit: CUSTOMER_LICENCE_HISTORY_LIMIT },
    CUSTOMER_LICENCE_HISTORY_LIMIT,
  );

/** Mỗi lần gọi là một dòng audit "đã mở ảnh bằng lái" ở server — chỉ gọi khi người xem bấm. */
export const fetchCustomerLicenceImage = (id: string): Promise<CustomerLicenceImage> =>
  apiGet<CustomerLicenceImage>(`/platform/driver-licences/${id}/image`);
