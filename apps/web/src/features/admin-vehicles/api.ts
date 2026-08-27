import { DEFAULT_PAGE_SIZE, pickFilter } from '@/constants/filters';
import {
  apiGet,
  apiPost,
  fetchPage,
  type Paged,
  type QueryParams,
} from '@/services/api-client';
import type { AdminVehicle, AdminVehicleDetail, AdminVehicleFilters } from './types';

export const ADMIN_VEHICLES_DEFAULT_LIMIT = DEFAULT_PAGE_SIZE;

export type AdminVehicleListResult = Paged<AdminVehicle>;

export function filtersToParams(filters: AdminVehicleFilters): QueryParams {
  return {
    q: filters.q ?? null,
    tenantId: filters.tenantId ?? null,
    publicStatus: pickFilter(filters.publicStatus),
    operationStatus: pickFilter(filters.operationStatus),
    vehicleType: pickFilter(filters.vehicleType),
    tenantStatus: pickFilter(filters.tenantStatus),
    page: filters.page ?? 1,
    limit: filters.limit ?? ADMIN_VEHICLES_DEFAULT_LIMIT,
  };
}

export const fetchAdminVehicles = (
  filters: AdminVehicleFilters,
): Promise<AdminVehicleListResult> =>
  fetchPage<AdminVehicle>(
    '/platform/vehicles',
    filtersToParams(filters),
    ADMIN_VEHICLES_DEFAULT_LIMIT,
  );

export const fetchAdminVehicle = (id: string): Promise<AdminVehicleDetail> =>
  apiGet<AdminVehicleDetail>(`/platform/vehicles/${id}`);

export const hideVehicle = (id: string, reason: string): Promise<AdminVehicleDetail> =>
  apiPost<AdminVehicleDetail>(`/platform/vehicles/${id}/hide`, { reason });

export const unhideVehicle = (id: string): Promise<AdminVehicleDetail> =>
  apiPost<AdminVehicleDetail>(`/platform/vehicles/${id}/unhide`);
