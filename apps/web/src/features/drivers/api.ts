import type { PaginationMeta } from '@xeprime/types';
import { apiDelete, apiPatch, apiPost, apiRequest, type QueryParams } from '@/services/api-client';
import type { CreateDriverInput, Driver, DriverFilters, UpdateDriverInput } from './types';

export const DRIVERS_DEFAULT_LIMIT = 20;

export interface DriverListResult {
  items: Driver[];
  meta: PaginationMeta;
}

export function filtersToParams(filters: DriverFilters): QueryParams {
  return {
    q: filters.q ?? null,
    status: filters.status ?? null,
    driverType: filters.driverType ?? null,
    page: filters.page ?? 1,
    limit: filters.limit ?? DRIVERS_DEFAULT_LIMIT,
  };
}

export async function fetchDrivers(filters: DriverFilters): Promise<DriverListResult> {
  const res = await apiRequest<Driver[]>('/drivers', { query: filtersToParams(filters) });
  return {
    items: res.data,
    meta: (res.meta as PaginationMeta | undefined) ?? {
      page: 1,
      limit: DRIVERS_DEFAULT_LIMIT,
      total: res.data.length,
      hasNext: false,
    },
  };
}

export const createDriver = (body: CreateDriverInput): Promise<Driver> =>
  apiPost<Driver>('/drivers', body);

export const updateDriver = (id: string, body: UpdateDriverInput): Promise<Driver> =>
  apiPatch<Driver>(`/drivers/${id}`, body);

export const deleteDriver = (id: string): Promise<{ ok: true }> =>
  apiDelete<{ ok: true }>(`/drivers/${id}`);
