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

/**
 * Trường thời gian mà bộ lọc "khoảng ngày" của danh sách đơn áp lên.
 *
 * Ở đây chứ không ở DTO/constants riêng vì đây là giá trị đi trong query string, web và api
 * PHẢI hiểu giống nhau — lệch một chữ là filter im lặng không có tác dụng.
 */
export const BOOKING_DATE_FIELD = {
  CREATED_AT: 'createdAt',
  PICKUP_AT: 'pickupAt',
} as const;

export type BookingDateField = (typeof BOOKING_DATE_FIELD)[keyof typeof BOOKING_DATE_FIELD];
export const BOOKING_DATE_FIELD_VALUES = Object.values(BOOKING_DATE_FIELD) as BookingDateField[];

export const BOOKING_DATE_FIELD_LABEL: Readonly<Record<BookingDateField, string>> = {
  [BOOKING_DATE_FIELD.CREATED_AT]: 'Theo ngày tạo',
  [BOOKING_DATE_FIELD.PICKUP_AT]: 'Theo ngày nhận xe',
};

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

/**
 * Đơn đã đi tới điểm cuối — `completed`, `cancelled`, `no_show`.
 *
 * SUY từ chính bảng chuyển trạng thái (không còn cạnh đi ra) thay vì liệt kê một danh sách thứ
 * hai: thêm một trạng thái kết thúc sau này sẽ tự động được tính vào đây thay vì âm thầm rơi ra
 * ngoài.
 *
 * Dùng để khoá GHI, không phải để khoá đọc: một chuyến đã khép lại là bằng chứng — đổi giờ, đổi
 * tiền hay đổi thông tin khách trên đó là viết lại lịch sử sau khi hai bên đã quyết toán. Sai số
 * cần sửa thì đi qua đường có lý do tường minh (điều chỉnh KM, phát sinh, điều chỉnh hoàn cọc).
 */
export function isBookingFinal(status: BookingStatus): boolean {
  return BOOKING_STATUS_TRANSITIONS[status].length === 0;
}

export const BOOKING_STATUS_META: Readonly<Record<BookingStatus, StatusMeta>> = {
  [BOOKING_STATUS.RESERVED]: { label: 'Đã đặt trước', color: 'blue' },
  [BOOKING_STATUS.CONFIRMED]: { label: 'Đã xác nhận', color: 'cyan' },
  [BOOKING_STATUS.ACTIVE]: { label: 'Đang thuê', color: 'green' },
  [BOOKING_STATUS.COMPLETED]: { label: 'Hoàn thành', color: 'default' },
  [BOOKING_STATUS.CANCELLED]: { label: 'Đã hủy', color: 'default' },
  [BOOKING_STATUS.NO_SHOW]: { label: 'Khách không đến', color: 'red' },
};
