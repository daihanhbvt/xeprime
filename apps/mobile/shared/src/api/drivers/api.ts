import type { components } from '@xeprime/types';
import { getApiClient, type Paged, type QueryParams } from '@xeprime/api-client';

type Schemas = components['schemas'];

/** Một LIÊN KẾT tài xế của bên thuê với một tài khoản khách (ADR 0063). */
export type Driver = Schemas['DriverDto'];
export type InviteDriverInput = Schemas['InviteDriverDto'];
export type UpdateDriverInput = Schemas['UpdateDriverDto'];
export type DriverLicenceSummary = Schemas['DriverLicenceSummaryDto'];
/** Tài xế trong bộ chọn gán đơn — `busy` = có chuyến khác giao khung giờ, ở BẤT KỲ bên thuê nào. */
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
  /** Bỏ trống = các liên kết còn mở (mời · đang liên kết · tạm khoá) — mặc định của server. */
  linkStatus?: string;
  driverType?: string;
  page?: number;
  limit?: number;
}

export function driverFiltersToParams(filters: DriverFilters): QueryParams {
  return {
    q: filters.q ?? null,
    linkStatus: filters.linkStatus ?? null,
    driverType: filters.driverType ?? null,
    page: filters.page ?? 1,
    limit: filters.limit ?? DRIVERS_DEFAULT_LIMIT,
  };
}

const base = '/drivers';
const one = (id: string) => `${base}/${encodeURIComponent(id)}`;

/**
 * Tài xế của bên thuê (gian hàng HOẶC chủ xe tuyến hoa hồng — ADR 0063) và bộ chọn gán đơn.
 * Bản native của `apps/web/src/features/drivers/api.ts` (ADR 0031 — sửa hợp đồng là sửa CẢ HAI).
 *
 * Khả dụng do SERVER quyết định — client không tự tính lịch bận, và backend vẫn kiểm lại trong
 * transaction lúc gán.
 */
export const driversApi = {
  list(filters: DriverFilters): Promise<Paged<Driver>> {
    return getApiClient().fetchPage<Driver>(
      base,
      driverFiltersToParams(filters),
      DRIVERS_DEFAULT_LIMIT,
    );
  },

  /** Mời một TÀI KHOẢN KHÁCH đã xác minh SĐT (`DRIVER_ACCOUNT_NOT_FOUND` khi chưa có). */
  invite(body: InviteDriverInput): Promise<Driver> {
    return getApiClient().post<Driver>(base, body);
  },

  update(id: string, body: UpdateDriverInput): Promise<Driver> {
    return getApiClient().patch<Driver>(one(id), body);
  },

  suspend(id: string): Promise<Driver> {
    return getApiClient().post<Driver>(`${one(id)}/suspend`);
  },

  resume(id: string): Promise<Driver> {
    return getApiClient().post<Driver>(`${one(id)}/resume`);
  },

  /** Thu hồi lời mời / kết thúc liên kết — server chặn khi tài xế đang chạy chuyến. */
  end(id: string): Promise<unknown> {
    return getApiClient().delete<unknown>(one(id));
  },

  assignable(window: AssignableWindow): Promise<AssignableDriver[]> {
    return getApiClient().get<AssignableDriver[]>(`${base}/assignable`, {
      pickupAt: window.pickupAt,
      returnAt: window.returnAt,
      excludeBookingId: window.excludeBookingId ?? null,
    });
  },
};
