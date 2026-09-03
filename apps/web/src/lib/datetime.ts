/**
 * Ngày giờ + múi giờ ứng dụng — đã chuyển sang `@xeprime/domain`.
 *
 * Re-export ở đúng đường dẫn cũ. Vẫn là chỗ DUY NHẤT để lấy `dayjs`: package dùng chung là nơi
 * nạp plugin `utc`/`timezone`/`customParseFormat`, nên `import dayjs from 'dayjs'` trực tiếp sẽ
 * thiếu plugin và `.tz()` nổ lúc chạy. `dayjs.locale(...)` vẫn không được gọi ở đâu (ADR 0012).
 *
 * Hai CHIỀU của một ô chọn ngày giờ, đừng lẫn:
 *  - API → ô chọn: `toAppTz(iso)` (mốc tuyệt đối, xem theo giờ VN);
 *  - ô chọn → API: `appWallClockToIso(value)` (giờ người dùng chọn LÀ giờ VN).
 */
export {
  APP_TIME_ZONE,
  DAY_PARAM_FORMAT,
  MONTH_PARAM_FORMAT,
  TIME_FORMAT,
  appWallClockToCalendarDate,
  appWallClockToInstant,
  appWallClockToIso,
  buildPeriodRange,
  calendarDateToAppWallClock,
  dayjs,
  nowInAppTz,
  rentalDurationParts,
  startOfAppDay,
  toAppTz,
  type Dayjs,
  type PeriodKey,
  type RentalDurationParts,
} from '@xeprime/domain';
