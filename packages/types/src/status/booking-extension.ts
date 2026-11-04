import { STATUS_COLOR, type StatusMeta } from './meta';

/**
 * PHỤ LỤC GIA HẠN một đơn thuê dài hạn đang chạy — ADR 0077.
 *
 * Vòng đời một chiều: `awaiting_payment` → `active` (tiền về đủ, giờ trả của đơn dời) | `expired`
 * (hết cửa sổ thanh toán) | `cancelled` (chủ xe huỷ khi còn chờ). Hai trạng thái cuối nhả lịch và
 * hoàn phần khách đã chuyển. CHECK `booking_extensions_status_check` liệt kê đúng bộ này.
 */
export const BOOKING_EXTENSION_STATUS = {
  AWAITING_PAYMENT: 'awaiting_payment',
  ACTIVE: 'active',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
} as const;

export type BookingExtensionStatus =
  (typeof BOOKING_EXTENSION_STATUS)[keyof typeof BOOKING_EXTENSION_STATUS];
export const BOOKING_EXTENSION_STATUS_VALUES = Object.values(
  BOOKING_EXTENSION_STATUS,
) as BookingExtensionStatus[];

export function isBookingExtensionStatus(value: unknown): value is BookingExtensionStatus {
  return (
    typeof value === 'string' && (BOOKING_EXTENSION_STATUS_VALUES as string[]).includes(value)
  );
}

export const BOOKING_EXTENSION_STATUS_META: Readonly<
  Record<BookingExtensionStatus, StatusMeta>
> = {
  [BOOKING_EXTENSION_STATUS.AWAITING_PAYMENT]: {
    label: 'Chờ khách thanh toán',
    color: STATUS_COLOR.WAITING,
  },
  [BOOKING_EXTENSION_STATUS.ACTIVE]: { label: 'Đã gia hạn', color: STATUS_COLOR.SUCCESS },
  [BOOKING_EXTENSION_STATUS.EXPIRED]: { label: 'Hết hạn thanh toán', color: STATUS_COLOR.NEUTRAL },
  [BOOKING_EXTENSION_STATUS.CANCELLED]: { label: 'Đã huỷ', color: STATUS_COLOR.NEUTRAL },
};
