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
  Driver,
  DriverFilters,
  InviteDriverInput,
  UpdateDriverInput,
} from './types';

export const DRIVERS_DEFAULT_LIMIT = DEFAULT_PAGE_SIZE;

export type DriverListResult = Paged<Driver>;

export function filtersToParams(filters: DriverFilters): QueryParams {
  return {
    q: filters.q ?? null,
    linkStatus: filters.linkStatus ?? null,
    driverType: filters.driverType ?? null,
    page: filters.page ?? 1,
    limit: filters.limit ?? DRIVERS_DEFAULT_LIMIT,
  };
}

export const fetchDrivers = (filters: DriverFilters): Promise<DriverListResult> =>
  fetchPage<Driver>('/drivers', filtersToParams(filters), DRIVERS_DEFAULT_LIMIT);

/** Mời một TÀI KHOẢN KHÁCH đã xác minh SĐT làm tài xế (ADR 0063). */
export const inviteDriver = (body: InviteDriverInput): Promise<Driver> =>
  apiPost<Driver>('/drivers', body);

export const updateDriver = (id: string, body: UpdateDriverInput): Promise<Driver> =>
  apiPatch<Driver>(`/drivers/${id}`, body);

export const suspendDriver = (id: string): Promise<Driver> =>
  apiPost<Driver>(`/drivers/${id}/suspend`);

export const resumeDriver = (id: string): Promise<Driver> =>
  apiPost<Driver>(`/drivers/${id}/resume`);

/** Thu hồi lời mời / kết thúc liên kết — server chặn khi tài xế đang chạy chuyến. */
export const endDriver = (id: string): Promise<unknown> => apiDelete<unknown>(`/drivers/${id}`);

/** Tài xế cho bộ chọn gán đơn — kèm cờ bận khung giờ + trạng thái bằng lái. */
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
