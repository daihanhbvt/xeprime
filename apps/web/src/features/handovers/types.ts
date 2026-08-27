import type { components } from '@xeprime/types';

/**
 * Bàn giao xe (Wave 7) — type sinh từ OpenAPI (ADR 0007), không viết tay.
 */
export type HandoverContext = components['schemas']['HandoverContextDto'];
export type Handover = components['schemas']['HandoverDto'];
export type HandoverPhoto = components['schemas']['HandoverPhotoDto'];
export type SaveHandoverInput = components['schemas']['SaveHandoverDto'];
export type ConfirmHandoverInput = components['schemas']['ConfirmHandoverDto'];
export type ResolveOdometerInput = components['schemas']['ResolveHandoverOdometerDto'];

/** Một việc trong hàng đợi "Thiếu KM trả" toàn gian hàng (Wave 8). */
export type MissingOdometerItem = components['schemas']['MissingOdometerItemDto'];

/** Chi tiết kèm theo lỗi 409 "KM bất thường" — server tính, UI chỉ hiển thị. */
export interface HandoverSuspicionDetails {
  suspicious: boolean;
  expectedMinKm: number;
  deltaKm: number;
  rentalDays: number;
  thresholdKmPerDay: number;
}

/** Chi tiết kèm theo lỗi "KM trả nhỏ hơn KM giao". */
export interface HandoverBelowPickupDetails {
  pickupKm: number;
  odometerKm: number;
  deltaKm: number;
}
