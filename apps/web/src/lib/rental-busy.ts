/**
 * Lịch bận của xe — đã chuyển sang `@xeprime/domain`.
 *
 * Re-export ở đúng đường dẫn cũ. Đây là LUẬT AN TOÀN, không phải tiện ích hiển thị: phép so
 * khoảng ở đây dùng cùng quy ước nửa mở `[)` với exclusion constraint ở tầng DB (ADR 0006), nên
 * lời cảnh báo trên màn khớp với thứ server sẽ từ chối. Hai client viết hai bản là hai câu trả
 * lời khác nhau cho cùng một chiếc xe.
 */
export {
  EMPTY_BUSY_INDEX,
  buildBusyDayIndex,
  busyDayKey,
  busyLevelOf,
  busyPeriodsOf,
  firstBusyDayAfter,
  rangeBusyConflict,
  type BusyDayIndex,
  type BusyDayInfo,
  type BusyLevel,
  type BusyPeriod,
} from '@xeprime/domain';
