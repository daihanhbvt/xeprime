/**
 * Chặn thời gian đặt xe của KHÁCH trên chợ — ADR 0091 điều 4.
 *
 * Hai số của nền tảng, sống ở chính sách phí đang hiệu lực (`fee_policies.max_advance_booking_days`,
 * `self_drive_max_days`):
 *
 *  - đặt trước tối đa N ngày — NGÀY nhận (giờ Việt Nam) không quá hôm gửi + N, áp cho tự lái và có
 *    tài xế; thuê dài hạn chọn ngày nhận theo luật của gói (ADR 0011), không đi qua đây;
 *  - chuyến tự lái dài tối đa M × 24 giờ — dài hơn thì đặt thuê dài hạn. Nhờ trần này mọi chuyến tự
 *    lái nằm trong bậc phí MIC tối đa 30 ngày, mỗi đơn đúng một hợp đồng bảo hiểm.
 *
 * Hàm THUẦN, dùng chung cho API (chặn thật lúc gửi yêu cầu) và web (báo sớm ở bộ chọn ngày). Server là
 * nơi quyết; web chỉ đọc lại cùng con số từ `GET /public/fee-policies/booking-limits`.
 */
import { addDateKeyDays, vnDateKey } from './long-term';
import { SERVICE_TYPE } from './status/vehicle';

export interface BookingLimits {
  /** Ngày nhận (giờ VN) không quá hôm gửi + số ngày này. */
  maxAdvanceBookingDays: number;
  /** Chuyến tự lái dài tối đa số ngày này × 24 giờ. */
  selfDriveMaxDays: number;
}

/** Giá trị của chính sách chưa khai — khớp DEFAULT của cột ở migration. */
export const BOOKING_LIMITS_DEFAULTS: Readonly<BookingLimits> = {
  maxAdvanceBookingDays: 15,
  selfDriveMaxDays: 30,
};

/** Biên admin được đặt — khớp CHECK ở DB. Tự lái không quá 90 ngày vì bậc phí MIC tối đa 30 ngày. */
export const BOOKING_LIMITS_BOUNDS = {
  maxAdvanceBookingDays: { min: 1, max: 365 },
  selfDriveMaxDays: { min: 1, max: 90 },
} as const;

export const BOOKING_LIMIT_VIOLATION = {
  /** Ngày nhận xa hơn hôm gửi + `maxAdvanceBookingDays`. */
  TOO_FAR_AHEAD: 'too_far_ahead',
  /** Chuyến tự lái dài hơn `selfDriveMaxDays` × 24 giờ. */
  SELF_DRIVE_TOO_LONG: 'self_drive_too_long',
} as const;

export type BookingLimitViolation =
  (typeof BOOKING_LIMIT_VIOLATION)[keyof typeof BOOKING_LIMIT_VIOLATION];

const DAY_MS = 86_400_000;

/** Hai số có nằm trong biên không — cổng ở DTO và ở hàm đọc chính sách. */
export function bookingLimitsValid(limits: BookingLimits): boolean {
  const inRange = (value: number, bounds: { min: number; max: number }) =>
    Number.isInteger(value) && value >= bounds.min && value <= bounds.max;
  return (
    inRange(limits.maxAdvanceBookingDays, BOOKING_LIMITS_BOUNDS.maxAdvanceBookingDays) &&
    inRange(limits.selfDriveMaxDays, BOOKING_LIMITS_BOUNDS.selfDriveMaxDays)
  );
}

/** Ngày nhận cuối cùng còn đặt được (`YYYY-MM-DD`, giờ VN) khi khách gửi lúc `now`. */
export function lastBookablePickupDateKey(now: Date, limits: BookingLimits): string {
  return addDateKeyDays(vnDateKey(now), limits.maxAdvanceBookingDays);
}

/** Dịch vụ nào chịu trần đặt trước — thuê dài hạn chọn ngày nhận theo gói, không đi qua đây. */
export function serviceHasAdvanceLimit(serviceType: string): boolean {
  return serviceType === SERVICE_TYPE.SELF_DRIVE || serviceType === SERVICE_TYPE.WITH_DRIVER;
}

/**
 * Lý do một yêu cầu vượt trần, hoặc `null` khi hợp lệ. Thiếu giờ nhận/trả (dài hạn chưa chốt lịch)
 * thì không có gì để kiểm.
 */
export function bookingLimitViolation(input: {
  serviceType: string;
  now: Date;
  pickupAt: Date | null;
  returnAt: Date | null;
  limits: BookingLimits;
}): BookingLimitViolation | null {
  const { serviceType, now, pickupAt, returnAt, limits } = input;
  if (!pickupAt) return null;
  if (
    serviceHasAdvanceLimit(serviceType) &&
    vnDateKey(pickupAt) > lastBookablePickupDateKey(now, limits)
  ) {
    return BOOKING_LIMIT_VIOLATION.TOO_FAR_AHEAD;
  }
  if (
    serviceType === SERVICE_TYPE.SELF_DRIVE &&
    returnAt &&
    returnAt.getTime() - pickupAt.getTime() > limits.selfDriveMaxDays * DAY_MS
  ) {
    return BOOKING_LIMIT_VIOLATION.SELF_DRIVE_TOO_LONG;
  }
  return null;
}
