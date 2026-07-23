import type { OccupancySourceType } from '@xeprime/types';

/** Một hàng của resource timeline — tương ứng một xe. */
export interface CalendarResource {
  id: string;
  vehicleId: string;
  name: string;
  plateNumber: string | null;
  vehicleType: string;
  operationStatus: string;
}

/**
 * Một thanh event trên lịch.
 *
 * `startAt`/`endAt` là ISO-8601 **UTC** đúng như backend trả. Việc đổi sang giờ
 * Asia/Ho_Chi_Minh chỉ xảy ra lúc hiển thị — giữ UTC ở tầng dữ liệu để phép tính vị trí
 * không phụ thuộc múi giờ của máy người dùng.
 */
export interface CalendarEvent {
  id: string;
  resourceId: string;
  type: OccupancySourceType | string;
  title: string;
  customerName: string | null;
  startAt: string;
  endAt: string;
  status: string | null;
  sourceId: string | null;
}

/** Khoảng ngày đang hiển thị. Nửa mở `[start, end)` giống ADR 0006. */
export interface CalendarRange {
  startAt: Date;
  endAt: Date;
  /** Số ngày (số cột) của lưới. */
  dayCount: number;
}

export interface CalendarFilters {
  /** ISO date `YYYY-MM-DD` của ngày đầu khoảng. */
  from: string;
  /** Số ngày hiển thị. */
  days: number;
  vehicleType: string | null;
  q: string | null;
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
