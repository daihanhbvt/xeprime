import { DEFAULT_PAGE_SIZE } from '@/constants/filters';
import {
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  fetchPage,
  type Paged,
  type QueryParams,
} from '@/services/api-client';
import type {
  AssignableDriver,
  CreateDriverInput,
  Driver,
  DriverFilters,
  UpdateDriverInput,
} from './types';

export const DRIVERS_DEFAULT_LIMIT = DEFAULT_PAGE_SIZE;

export type DriverListResult = Paged<Driver>;

export function filtersToParams(filters: DriverFilters): QueryParams {
  return {
    q: filters.q ?? null,
    status: filters.status ?? null,
    driverType: filters.driverType ?? null,
    page: filters.page ?? 1,
    limit: filters.limit ?? DRIVERS_DEFAULT_LIMIT,
  };
}

export const fetchDrivers = (filters: DriverFilters): Promise<DriverListResult> =>
  fetchPage<Driver>('/drivers', filtersToParams(filters), DRIVERS_DEFAULT_LIMIT);

export const createDriver = (body: CreateDriverInput): Promise<Driver> =>
  apiPost<Driver>('/drivers', body);

export const updateDriver = (id: string, body: UpdateDriverInput): Promise<Driver> =>
  apiPatch<Driver>(`/drivers/${id}`, body);

export const deleteDriver = (id: string): Promise<{ ok: true }> =>
  apiDelete<{ ok: true }>(`/drivers/${id}`);

/** Tài xế cho bộ chọn gán đơn — kèm cờ bận khung giờ / GPLX hết hạn (17/08). */
export const fetchAssignableDrivers = (window: {
  pickupAt: string;
  returnAt: string;
  excludeBookingId?: string;
}): Promise<AssignableDriver[]> =>
  apiGet<AssignableDriver[]>('/drivers/assignable', {
    pickupAt: window.pickupAt,
    returnAt: window.returnAt,
    excludeBookingId: window.excludeBookingId ?? null,
  });
