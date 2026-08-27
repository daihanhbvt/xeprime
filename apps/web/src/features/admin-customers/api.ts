import { DEFAULT_PAGE_SIZE, pickFilter } from '@/constants/filters';
import {
  apiGet,
  apiPost,
  fetchPage,
  type Paged,
  type QueryParams,
} from '@/services/api-client';
import type {
  AdminCustomer,
  AdminCustomerDetail,
  AdminCustomerFilters,
  CustomerContact,
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
