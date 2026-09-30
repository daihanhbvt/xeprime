import {
  DAY_PARAM_FORMAT,
  nowInAppTz,
  startOfAppDay,
  toAppTz,
  type Dayjs,
} from '@xeprime/domain';

/** Khoảng ngày đang hiển thị. Nửa mở `[startAt, endAt)` giống ADR 0006. */
export interface CalendarRange {
  startAt: Date;
  endAt: Date;
  /** Số ngày (số cột) của lưới. */
  dayCount: number;
}

export interface DayCell {
  /** `YYYY-MM-DD` giờ VN — khoá tra ngày lễ, giá riêng, số xe trống. */
  key: string;
  at: Dayjs;
  dayOfMonth: number;
  isToday: boolean;
  isWeekend: boolean;
}

/**
 * Dựng khoảng hiển thị từ một ngày lịch.
 *
 * Bản sao của `apps/web/src/features/calendar/utils/calendar-date.util.ts` — cùng phép tính, vì
 * hai client phải vẽ ra ĐÚNG một lưới cho cùng một bộ lọc. Chưa rút lên `@xeprime/domain` vì đợt
 * này không được sửa `apps/web` ngoài i18n; khi rút thì cả hai bên cùng đổi import trong một lần.
 *
 * Ranh giới ngày phải tính theo giờ Việt Nam rồi mới đổi sang UTC: người dùng hiểu "ngày 12/7" là
 * 00:00–24:00 giờ VN, không phải giờ UTC. Lấy `startOf('day')` theo giờ MÁY sẽ làm lệch lưới và
 * event hiện sai cột trên một thiết bị đang ở múi giờ khác.
 */
export function buildRange(fromIsoDate: string, days: number): CalendarRange {
  const start = startOfAppDay(fromIsoDate);
  return {
    startAt: start.toDate(),
    endAt: start.add(days, 'day').toDate(),
    dayCount: days,
  };
}

/**
 * Danh sách cột ngày để render header.
 *
 * Trả `at` (mốc Dayjs của cột) chứ KHÔNG trả nhãn thứ: nhãn thứ đổi theo ngôn ngữ. Component gọi
 * `fmt.weekdayShort(day.at)`. `dayjs.locale(...)` không phải lựa chọn thay thế — nó đổi trạng
 * thái toàn tiến trình (CLAUDE.md mục 5).
 */
export function listDays(range: CalendarRange): DayCell[] {
  const today = nowInAppTz().startOf('day');
  const start = toAppTz(range.startAt);

  return Array.from({ length: range.dayCount }, (_, i) => {
    const day = start.add(i, 'day');
    const weekday = day.day();
    return {
      key: day.format(DAY_PARAM_FORMAT),
      at: day,
      dayOfMonth: day.date(),
      isToday: day.isSame(today, 'day'),
      isWeekend: weekday === 0 || weekday === 6,
    };
  });
}

/** Ngày hôm nay dạng `YYYY-MM-DD` theo giờ VN — giá trị mặc định của bộ lọc. */
export function todayIsoDate(): string {
  return nowInAppTz().format(DAY_PARAM_FORMAT);
}

/** Dời khoảng xem đi `direction × days` ngày, trả về `from` mới. */
export function shiftFrom(from: string, days: number, direction: 1 | -1): string {
  return startOfAppDay(from)
    .add(direction * days, 'day')
    .format(DAY_PARAM_FORMAT);
}

/** Ngày CUỐI CÙNG (inclusive) của khoảng — biên mà endpoint ngày lễ và bulk-day nhận. */
export function lastDayOf(range: CalendarRange): string {
  return toAppTz(range.startAt)
    .add(Math.max(0, range.dayCount - 1), 'day')
    .format(DAY_PARAM_FORMAT);
}

/** Đầu khoảng dạng `YYYY-MM-DD` giờ VN. */
export function firstDayOf(range: CalendarRange): string {
  return toAppTz(range.startAt).format(DAY_PARAM_FORMAT);
}
