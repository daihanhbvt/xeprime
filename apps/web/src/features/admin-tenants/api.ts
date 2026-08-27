import { DEFAULT_PAGE_SIZE, pickFilter } from '@/constants/filters';
import {
  apiGet,
  apiPost,
  fetchPage,
  type Paged,
  type QueryParams,
} from '@/services/api-client';
import type { AdminTenant, AdminTenantDetail, AdminTenantFilters } from './types';

export const ADMIN_TENANTS_DEFAULT_LIMIT = DEFAULT_PAGE_SIZE;

export type AdminTenantListResult = Paged<AdminTenant>;

export function filtersToParams(filters: AdminTenantFilters): QueryParams {
  return {
    status: pickFilter(filters.status),
    q: filters.q ?? null,
    page: filters.page ?? 1,
    limit: filters.limit ?? ADMIN_TENANTS_DEFAULT_LIMIT,
  };
}

export const fetchAdminTenants = (filters: AdminTenantFilters): Promise<AdminTenantListResult> =>
  fetchPage<AdminTenant>('/platform/tenants', filtersToParams(filters), ADMIN_TENANTS_DEFAULT_LIMIT);

export const fetchAdminTenant = (id: string): Promise<AdminTenantDetail> =>
  apiGet<AdminTenantDetail>(`/platform/tenants/${id}`);

export const lockTenant = (id: string, reason?: string): Promise<AdminTenantDetail> =>
  apiPost<AdminTenantDetail>(`/platform/tenants/${id}/lock`, { reason });

export const unlockTenant = (id: string): Promise<AdminTenantDetail> =>
  apiPost<AdminTenantDetail>(`/platform/tenants/${id}/unlock`);
