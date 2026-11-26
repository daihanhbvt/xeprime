import { BOOKING_STATUS, type BookingStatus } from './booking';

/**
 * Loại tài sản thế chấp khách để lại cho MỘT đơn (ADR 0109) — CHECK `booking_collaterals_type_check`.
 *
 * Rộng hơn `COLLATERAL_ASSET_TYPE` của chính sách xe: chính sách là lời công bố trên chợ (danh mục đóng
 * để lọc/so sánh), còn dòng của đơn là sổ ghi nhận thực tế giữa hai bên — CCCD và bằng lái là thứ khách
 * hay để lại nhất. `other` bắt buộc mô tả (CHECK `booking_collaterals_other_description_check`).
 */
export const BOOKING_COLLATERAL_TYPE = {
  CITIZEN_ID: 'citizen_id',
  DRIVER_LICENCE: 'driver_licence',
  PASSPORT: 'passport',
  /** Chính chiếc xe máy, gửi lại tại gian hàng — mô tả nên ghi biển số. */
  MOTORBIKE: 'motorbike',
  /** Cà vẹt / giấy đăng ký xe máy của khách. */
  VEHICLE_REGISTRATION: 'vehicle_registration',
  OTHER: 'other',
} as const;

export type BookingCollateralType =
  (typeof BOOKING_COLLATERAL_TYPE)[keyof typeof BOOKING_COLLATERAL_TYPE];
export const BOOKING_COLLATERAL_TYPE_VALUES = Object.values(
  BOOKING_COLLATERAL_TYPE,
) as BookingCollateralType[];

/** Loại bắt buộc có mô tả — một luật cho DTO API, form web và app native. */
export function bookingCollateralNeedsDescription(type: string): boolean {
  return type === BOOKING_COLLATERAL_TYPE.OTHER;
}

/** Tối đa bấy nhiêu món tài sản trên một đơn (lúc tạo + thêm sau). */
export const BOOKING_COLLATERAL_MAX_ITEMS = 10;
/** Trần mô tả — khớp `booking_collaterals.description VARCHAR(255)`. */
export const BOOKING_COLLATERAL_DESCRIPTION_MAX = 255;

/**
 * Đơn còn THÊM / GỠ tài sản được — xe chưa trả. Đánh dấu đã trả / hoàn tác thì mọi trạng thái (trả
 * tài sản có thể diễn ra lúc khép chuyến hoặc sau đó).
 */
export const BOOKING_COLLATERAL_EDITABLE_STATUSES: readonly BookingStatus[] = [
  BOOKING_STATUS.RESERVED,
  BOOKING_STATUS.CONFIRMED,
  BOOKING_STATUS.ACTIVE,
];

export function isBookingCollateralEditable(status: string): boolean {
  return (BOOKING_COLLATERAL_EDITABLE_STATUSES as readonly string[]).includes(status);
}

/** Audit của sổ tài sản thế chấp (ADR 0109) — writer duy nhất `BookingCollateralsService`. */
export const BOOKING_COLLATERAL_AUDIT_ACTION = {
  ADD: 'booking.collateral_add',
  REMOVE: 'booking.collateral_remove',
  RETURN: 'booking.collateral_return',
  UNRETURN: 'booking.collateral_unreturn',
  /** Sửa loại / mô tả của một món chưa trả (26/11/2026 - cọc linh động theo từng đơn). */
  UPDATE: 'booking.collateral_update',
} as const;

/**
 * Phụ phí theo dòng của đơn gian hàng tự lập (ADR 0109 — vd "Ghế trẻ em"). Dòng nằm trong snapshot
 * giá với khoá `PRICE_ROW.EXTRAS`, Σ ở `bookings.extra_charges_amount`.
 */
export const BOOKING_EXTRA_CHARGE_MAX_LINES = 10;
export const BOOKING_EXTRA_CHARGE_LABEL_MAX = 80;
