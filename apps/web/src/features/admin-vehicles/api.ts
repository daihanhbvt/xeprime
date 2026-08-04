import type { PaginationMeta } from '@xeprime/types';
import { apiGet, apiPost, apiRequest, type QueryParams } from '@/services/api-client';
import type { AdminVehicle, AdminVehicleDetail, AdminVehicleFilters } from './types';

export const ADMIN_VEHICLES_DEFAULT_LIMIT = 20;

export interface AdminVehicleListResult {
  items: AdminVehicle[];
  meta: PaginationMeta;
}

/** 'all' = mọi giá trị → bỏ tham số (BE chỉ nhận giá trị thuộc union, ADR 0005). */
const pick = (v: string | undefined) => (v && v !== 'all' ? v : null);

export function filtersToParams(filters: AdminVehicleFilters): QueryParams {
  return {
    q: filters.q ?? null,
    tenantId: filters.tenantId ?? null,
    publicStatus: pick(filters.publicStatus),
    operationStatus: pick(filters.operationStatus),
    vehicleType: pick(filters.vehicleType),
    tenantStatus: pick(filters.tenantStatus),
    page: filters.page ?? 1,
    limit: filters.limit ?? ADMIN_VEHICLES_DEFAULT_LIMIT,
  };
}

export async function fetchAdminVehicles(
  filters: AdminVehicleFilters,
): Promise<AdminVehicleListResult> {
  const res = await apiRequest<AdminVehicle[]>('/platform/vehicles', {
    query: filtersToParams(filters),
  });
  return {
    items: res.data,
    meta: (res.meta as PaginationMeta | undefined) ?? {
      page: 1,
      limit: ADMIN_VEHICLES_DEFAULT_LIMIT,
      total: res.data.length,
      hasNext: false,
    },
  };
}

export const fetchAdminVehicle = (id: string): Promise<AdminVehicleDetail> =>
  apiGet<AdminVehicleDetail>(`/platform/vehicles/${id}`);

export const hideVehicle = (id: string, reason: string): Promise<AdminVehicleDetail> =>
  apiPost<AdminVehicleDetail>(`/platform/vehicles/${id}/hide`, { reason });

export const unhideVehicle = (id: string): Promise<AdminVehicleDetail> =>
  apiPost<AdminVehicleDetail>(`/platform/vehicles/${id}/unhide`);
