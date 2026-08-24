/**
 * Ngày giờ + múi giờ ứng dụng — đã chuyển sang `@xeprime/domain`.
 *
 * Re-export ở đúng đường dẫn cũ. Vẫn là chỗ DUY NHẤT để lấy `dayjs`: package dùng chung là nơi
 * nạp plugin `utc`/`timezone`/`customParseFormat`, nên `import dayjs from 'dayjs'` trực tiếp sẽ
 * thiếu plugin và `.tz()` nổ lúc chạy. `dayjs.locale(...)` vẫn không được gọi ở đâu (ADR 0012).
 */
export {
  APP_TIME_ZONE,
  DAY_PARAM_FORMAT,
  MONTH_PARAM_FORMAT,
  TIME_FORMAT,
  buildPeriodRange,
  dayjs,
  rentalDurationParts,
  startOfAppDay,
  toAppTz,
  type Dayjs,
  type RentalDurationParts,
} from '@xeprime/domain';
