import type { components } from '@xeprime/types';
import { getApiClient, type Paged, type QueryParams } from '@xeprime/api-client';

type Schemas = components['schemas'];

export type Driver = Schemas['DriverDto'];
export type CreateDriverInput = Schemas['CreateDriverDto'];
export type UpdateDriverInput = Schemas['UpdateDriverDto'];
/** Tài xế trong bộ chọn gán đơn — kèm cờ bận khung giờ / GPLX hết hạn. */
export type AssignableDriver = Schemas['AssignableDriverDto'];

/** Cùng `DEFAULT_PAGE_SIZE` mà web dùng cho bảng tài xế. */
export const DRIVERS_DEFAULT_LIMIT = 20;

export interface AssignableWindow {
  pickupAt: string;
  returnAt: string;
  /** Đơn ĐANG sửa — trừ chính nó ra, nếu không tài xế đã gán tự báo là đang bận. */
  excludeBookingId?: string;
}

export interface DriverFilters {
  q?: string;
  status?: string;
  driverType?: string;
  page?: number;
  limit?: number;
}

export function driverFiltersToParams(filters: DriverFilters): QueryParams {
  return {
    q: filters.q ?? null,
    status: filters.status ?? null,
    driverType: filters.driverType ?? null,
    page: filters.page ?? 1,
    limit: filters.limit ?? DRIVERS_DEFAULT_LIMIT,
  };
}

const base = '/drivers';
const one = (id: string) => `${base}/${encodeURIComponent(id)}`;

/**
 * Tài xế của gian hàng (SHP-06) và bộ chọn gán đơn (BKG).
 *
 * MỘT module cho cả hai: `assignable` trả về đúng những hồ sơ mà `list` quản lý, chỉ khác ở chỗ
 * nó chấm sẵn "bận / GPLX hết hạn" cho một khung giờ cụ thể. Tách hai đường là hẹn ngày tài xế
 * vừa tạo không xuất hiện ở bộ chọn.
 *
 * Khả dụng do SERVER quyết định — client không tự tính lịch bận, và backend vẫn kiểm lại trong
 * transaction lúc gán (không tin FE).
 */
export const driversApi = {
  list(filters: DriverFilters): Promise<Paged<Driver>> {
    return getApiClient().fetchPage<Driver>(
      base,
      driverFiltersToParams(filters),
      DRIVERS_DEFAULT_LIMIT,
    );
  },

  create(body: CreateDriverInput): Promise<Driver> {
    return getApiClient().post<Driver>(base, body);
  },

  update(id: string, body: UpdateDriverInput): Promise<Driver> {
    return getApiClient().patch<Driver>(one(id), body);
  },

  /** Xoá MỀM ở server; còn đơn chưa hoàn tất thì bị chặn bằng 409. */
  remove(id: string): Promise<{ ok: true }> {
    return getApiClient().delete<{ ok: true }>(one(id));
  },

  assignable(window: AssignableWindow): Promise<AssignableDriver[]> {
    return getApiClient().get<AssignableDriver[]>(`${base}/assignable`, {
      pickupAt: window.pickupAt,
      returnAt: window.returnAt,
      excludeBookingId: window.excludeBookingId ?? null,
    });
  },
};
