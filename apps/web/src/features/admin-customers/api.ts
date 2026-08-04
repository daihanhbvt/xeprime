import type { PaginationMeta } from '@xeprime/types';
import { apiGet, apiPost, apiRequest, type QueryParams } from '@/services/api-client';
import type {
  AdminCustomer,
  AdminCustomerDetail,
  AdminCustomerFilters,
  CustomerContact,
} from './types';

export const ADMIN_CUSTOMERS_DEFAULT_LIMIT = 20;

export interface AdminCustomerListResult {
  items: AdminCustomer[];
  meta: PaginationMeta;
}

export function filtersToParams(filters: AdminCustomerFilters): QueryParams {
  return {
    q: filters.q ?? null,
    phone: filters.phone ?? null,
    email: filters.email ?? null,
    status: filters.status && filters.status !== 'all' ? filters.status : null,
    hasRequests: filters.hasRequests ? 'true' : null,
    page: filters.page ?? 1,
    limit: filters.limit ?? ADMIN_CUSTOMERS_DEFAULT_LIMIT,
  };
}

export async function fetchAdminCustomers(
  filters: AdminCustomerFilters,
): Promise<AdminCustomerListResult> {
  const res = await apiRequest<AdminCustomer[]>('/platform/customers', {
    query: filtersToParams(filters),
  });
  return {
    items: res.data,
    meta: (res.meta as PaginationMeta | undefined) ?? {
      page: 1,
      limit: ADMIN_CUSTOMERS_DEFAULT_LIMIT,
      total: res.data.length,
      hasNext: false,
    },
  };
}

export const fetchAdminCustomer = (id: string): Promise<AdminCustomerDetail> =>
  apiGet<AdminCustomerDetail>(`/platform/customers/${id}`);

/** Bỏ che SĐT/email. Mỗi lần gọi là một dòng audit ở backend — không gọi ngầm/tự động. */
export const revealCustomerContact = (id: string): Promise<CustomerContact> =>
  apiPost<CustomerContact>(`/platform/customers/${id}/contact`);
