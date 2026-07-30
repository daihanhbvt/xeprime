import type { PaginationMeta } from '@xeprime/types';
import { apiGet, apiPost, apiRequest, type QueryParams } from '@/services/api-client';
import type { AdminTenant, AdminTenantDetail, AdminTenantFilters } from './types';

export const ADMIN_TENANTS_DEFAULT_LIMIT = 20;

export interface AdminTenantListResult {
  items: AdminTenant[];
  meta: PaginationMeta;
}

export function filtersToParams(filters: AdminTenantFilters): QueryParams {
  return {
    // 'all' = mọi trạng thái → bỏ tham số (BE chỉ nhận status hợp lệ).
    status: filters.status && filters.status !== 'all' ? filters.status : null,
    q: filters.q ?? null,
    page: filters.page ?? 1,
    limit: filters.limit ?? ADMIN_TENANTS_DEFAULT_LIMIT,
  };
}

export async function fetchAdminTenants(filters: AdminTenantFilters): Promise<AdminTenantListResult> {
  const res = await apiRequest<AdminTenant[]>('/platform/tenants', {
    query: filtersToParams(filters),
  });
  return {
    items: res.data,
    meta: (res.meta as PaginationMeta | undefined) ?? {
      page: 1,
      limit: ADMIN_TENANTS_DEFAULT_LIMIT,
      total: res.data.length,
      hasNext: false,
    },
  };
}

export const fetchAdminTenant = (id: string): Promise<AdminTenantDetail> =>
  apiGet<AdminTenantDetail>(`/platform/tenants/${id}`);

export const lockTenant = (id: string, reason?: string): Promise<AdminTenantDetail> =>
  apiPost<AdminTenantDetail>(`/platform/tenants/${id}/lock`, { reason });

export const unlockTenant = (id: string): Promise<AdminTenantDetail> =>
  apiPost<AdminTenantDetail>(`/platform/tenants/${id}/unlock`);
