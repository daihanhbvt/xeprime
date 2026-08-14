import type { components } from '@xeprime/types';

/**
 * Shape lịch lấy thẳng từ contract sinh bởi OpenAPI (ADR 0007) — KHÔNG viết tay lại DTO.
 * Đổi DTO backend → chạy `pnpm contract` → các type này tự cập nhật.
 */
type Schemas = components['schemas'];

/** Một hàng của resource timeline — tương ứng một xe. */
export type CalendarResource = Schemas['CalendarResourceDto'];

/**
 * Một thanh event trên lịch.
 *
 * `startAt`/`endAt` là ISO-8601 **UTC** đúng như backend trả. Việc đổi sang giờ
 * Asia/Ho_Chi_Minh chỉ xảy ra lúc hiển thị — giữ UTC ở tầng dữ liệu để phép tính vị trí
 * không phụ thuộc múi giờ của máy người dùng.
 */
export type CalendarEvent = Schemas['CalendarEventDto'];

/** Hàng "Xe còn trống" — backend đếm trên TOÀN đội xe đã lọc (không chỉ hàng đang render). */
export type CalendarAvailability = Schemas['CalendarAvailabilityDto'];
export type CalendarAvailabilityDay = Schemas['CalendarAvailabilityDayDto'];

/** Dấu "giá riêng" trên ô lịch. */
export type CalendarDailyPrice = Schemas['CalendarDailyPriceDto'];

/** Khoá xe thủ công (nguồn `blocked_range`). */
export type VehicleBlock = Schemas['VehicleBlockDto'];
export type CreateVehicleBlockInput = Schemas['CreateVehicleBlockDto'];
export type UpdateVehicleBlockInput = Schemas['UpdateVehicleBlockDto'];

/** Bản ghi đè giá theo ngày của MỘT xe (đọc/ghi ở dialog đặt giá). */
export type VehicleDailyPrice = Schemas['VehicleDailyPriceDto'];
export type SaveDailyPricesInput = Schemas['SaveDailyPricesDto'];

/** Báo giá nội bộ (`/calendar/quote`) — cùng shape với báo giá công khai. */
export type CalendarQuote = Schemas['QuoteBreakdownDto'];

/** Khoảng ngày đang hiển thị. Nửa mở `[start, end)` giống ADR 0006. */
export interface CalendarRange {
  startAt: Date;
  endAt: Date;
  /** Số ngày (số cột) của lưới. */
  dayCount: number;
}

/** Khớp `CALENDAR_SORT_VALUES` ở backend DTO. */
export type CalendarSort = 'next_booking' | 'name' | 'price_asc' | 'price_desc';

export interface CalendarFilters {
  /** ISO date `YYYY-MM-DD` của ngày đầu khoảng. */
  from: string;
  /** Số ngày hiển thị. */
  days: number;
  vehicleType: string | null;
  q: string | null;
  /** Thứ tự hàng xe — chỉ ảnh hưởng `resources`, các query khác không mang nó. */
  sort: CalendarSort;
}

/** Vị trí của thanh event trong lưới, tính theo phần trăm chiều rộng một ngày. */
export interface EventBarPosition {
  /** Offset trái, đơn vị "ngày" (có phần thập phân). */
  offsetDays: number;
  /** Chiều dài, đơn vị "ngày". */
  spanDays: number;
  /** Event bắt đầu trước khoảng đang xem — vẽ bo góc trái phẳng. */
  clippedStart: boolean;
  /** Event kết thúc sau khoảng đang xem. */
  clippedEnd: boolean;
}
