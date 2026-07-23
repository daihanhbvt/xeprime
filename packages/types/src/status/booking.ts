import type { StatusMeta } from './meta';

/**
 * Trạng thái đơn thuê thật (ADR 0005).
 *
 * Nguồn: `xeprime_database_design.md` §11.2, được `xeprime_screen_spec_by_role_before_db.md`
 * §11.4 xác nhận. `xeprime_overall_user_flow_next_node.md` §15 ghi `in_progress` và thêm
 * `draft` — bản đó BỊ GHI ĐÈ, không dùng.
 */
export const BOOKING_STATUS = {
  RESERVED: 'reserved',
  CONFIRMED: 'confirmed',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  NO_SHOW: 'no_show',
} as const;

export type BookingStatus = (typeof BOOKING_STATUS)[keyof typeof BOOKING_STATUS];

export const BOOKING_STATUS_VALUES = Object.values(BOOKING_STATUS) as BookingStatus[];

export function isBookingStatus(value: unknown): value is BookingStatus {
  return typeof value === 'string' && (BOOKING_STATUS_VALUES as string[]).includes(value);
}

/**
 * Các trạng thái CHIẾM CHỖ trên lịch xe (ADR 0006).
 *
 * `OccupancyService` dùng đúng danh sách này để quyết định ghi hay xoá bản ghi
 * `vehicle_occupancies`. Thêm một trạng thái mới vào `BOOKING_STATUS` mà quên cập nhật
 * đây là cách tạo ra lỗ trùng lịch — nên hai thứ nằm cạnh nhau.
 */
export const BOOKING_STATUS_OCCUPYING: readonly BookingStatus[] = [
  BOOKING_STATUS.RESERVED,
  BOOKING_STATUS.CONFIRMED,
  BOOKING_STATUS.ACTIVE,
];

export function occupiesSchedule(status: BookingStatus): boolean {
  return BOOKING_STATUS_OCCUPYING.includes(status);
}

/** Chuyển trạng thái hợp lệ. Backend validate bằng bảng này, không tin client. */
export const BOOKING_STATUS_TRANSITIONS: Readonly<Record<BookingStatus, readonly BookingStatus[]>> =
  {
    [BOOKING_STATUS.RESERVED]: [
      BOOKING_STATUS.CONFIRMED,
      BOOKING_STATUS.CANCELLED,
      BOOKING_STATUS.NO_SHOW,
    ],
    [BOOKING_STATUS.CONFIRMED]: [
      BOOKING_STATUS.ACTIVE,
      BOOKING_STATUS.CANCELLED,
      BOOKING_STATUS.NO_SHOW,
    ],
    [BOOKING_STATUS.ACTIVE]: [BOOKING_STATUS.COMPLETED],
    [BOOKING_STATUS.COMPLETED]: [],
    [BOOKING_STATUS.CANCELLED]: [],
    [BOOKING_STATUS.NO_SHOW]: [],
  };

export function canTransitionBooking(from: BookingStatus, to: BookingStatus): boolean {
  return BOOKING_STATUS_TRANSITIONS[from].includes(to);
}

export const BOOKING_STATUS_META: Readonly<Record<BookingStatus, StatusMeta>> = {
  [BOOKING_STATUS.RESERVED]: { label: 'Đã đặt trước', color: 'blue' },
  [BOOKING_STATUS.CONFIRMED]: { label: 'Đã xác nhận', color: 'cyan' },
  [BOOKING_STATUS.ACTIVE]: { label: 'Đang thuê', color: 'green' },
  [BOOKING_STATUS.COMPLETED]: { label: 'Hoàn thành', color: 'default' },
  [BOOKING_STATUS.CANCELLED]: { label: 'Đã hủy', color: 'default' },
  [BOOKING_STATUS.NO_SHOW]: { label: 'Khách không đến', color: 'red' },
};
