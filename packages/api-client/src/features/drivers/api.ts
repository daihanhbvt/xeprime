import type { components } from '@xeprime/types';
import { getApiClient } from '../../client';

type Schemas = components['schemas'];

export type Driver = Schemas['DriverDto'];
/** Tài xế trong bộ chọn gán đơn — kèm cờ bận khung giờ / GPLX hết hạn. */
export type AssignableDriver = Schemas['AssignableDriverDto'];

export interface AssignableWindow {
  pickupAt: string;
  returnAt: string;
  /** Đơn ĐANG sửa — trừ chính nó ra, nếu không tài xế đã gán tự báo là đang bận. */
  excludeBookingId?: string;
}

/**
 * Chỉ bộ chọn gán đơn. CRUD hồ sơ tài xế (SHP-06) là màn khác, quyền khác (`drivers.manage`) —
 * app native chưa phục vụ nó.
 */
export const driversApi = {
  assignable(window: AssignableWindow): Promise<AssignableDriver[]> {
    return getApiClient().get<AssignableDriver[]>('/drivers/assignable', {
      pickupAt: window.pickupAt,
      returnAt: window.returnAt,
      excludeBookingId: window.excludeBookingId ?? null,
    });
  },
};
