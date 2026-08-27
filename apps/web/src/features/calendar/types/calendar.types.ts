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

/**
 * Thao tác HÀNG LOẠT cho một khoảng ngày — khoá hoặc đặt giá cả đội xe từ thẻ ngày trên lịch.
 *
 * `BulkDayPreview` là nguồn dữ liệu của CẢ hai dialog: nó trả giá NIÊM YẾT của từng xe chứ
 * không trả giá đã tính, vì phép tính nằm ở `planBulkDayPrices` (@xeprime/domain) mà cả client
 * lẫn server cùng gọi — bảng xem trước và dòng ghi xuống DB do đó không thể lệch nhau.
 */
export type BulkDayPreview = Schemas['BulkDayPreviewDto'];
export type BulkDayVehicle = Schemas['BulkDayVehicleDto'];
export type BulkDayBlockResult = Schemas['BulkDayBlockResultDto'];
export type BulkDayPriceResult = Schemas['BulkDayPriceResultDto'];
export type BulkDayBlockInput = Schemas['BulkDayBlockDto'];
export type BulkDayPriceInput = Schemas['BulkDayPriceDto'];

/**
 * Ngày lễ — lớp thông tin chồng lên lưới, KHÔNG phải một loại event.
 *
 * Cố ý không gộp vào `CalendarEvent`: event chiếm chỗ của một chiếc xe cụ thể và có thể mở ra
 * chi tiết; ngày lễ chỉ tô một cột và không thuộc xe nào. `endDate` là ngày CUỐI CÙNG
 * (inclusive) — backend đã xử lý bẫy end-exclusive của nguồn dữ liệu.
 */
export type Holiday = Schemas['HolidayDto'];
export type HolidayList = Schemas['HolidayListDto'];

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
