import dayjs from 'dayjs';
import type { CalendarRange } from '../types/calendar.types';

/**
 * Múi giờ hiển thị của sản phẩm — CLAUDE.md mục 9.
 *
 * `Asia/Ho_Chi_Minh`, không phải `Asia/Bangkok` như tài liệu cũ ghi. Cùng UTC+7 nên kết
 * quả giống nhau, nhưng dùng đúng tên vùng để sau này không ai phải đoán là cố ý hay nhầm.
 */
export const DISPLAY_TIMEZONE = 'Asia/Ho_Chi_Minh';

/**
 * Dựng khoảng hiển thị từ một ngày local.
 *
 * Ranh giới ngày phải tính theo giờ Việt Nam rồi mới đổi sang UTC: người dùng hiểu "ngày
 * 12/7" là 00:00–24:00 giờ VN, không phải giờ UTC. Lấy `startOf('day')` theo UTC sẽ làm
 * lệch lưới 7 tiếng và event hiện sai cột.
 */
export function buildRange(fromIsoDate: string, days: number): CalendarRange {
  const start = dayjs.tz(fromIsoDate, DISPLAY_TIMEZONE).startOf('day');
  const end = start.add(days, 'day');

  return {
    startAt: start.toDate(),
    endAt: end.toDate(),
    dayCount: days,
  };
}

/** Danh sách cột ngày để render header. */
export function listDays(range: CalendarRange): Array<{
  key: string;
  dayOfMonth: number;
  weekdayLabel: string;
  isToday: boolean;
  isWeekend: boolean;
}> {
  const today = dayjs().tz(DISPLAY_TIMEZONE).startOf('day');
  const start = dayjs(range.startAt).tz(DISPLAY_TIMEZONE);

  return Array.from({ length: range.dayCount }, (_, i) => {
    const day = start.add(i, 'day');
    const weekday = day.day();
    return {
      key: day.format('YYYY-MM-DD'),
      dayOfMonth: day.date(),
      weekdayLabel: WEEKDAY_LABELS[weekday] ?? '',
      isToday: day.isSame(today, 'day'),
      isWeekend: weekday === 0 || weekday === 6,
    };
  });
}

const WEEKDAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'] as const;

/** Hiển thị mốc thời gian UTC theo giờ Việt Nam. */
export function formatDateTime(isoUtc: string): string {
  return dayjs(isoUtc).tz(DISPLAY_TIMEZONE).format('HH:mm DD/MM/YYYY');
}

export function formatDate(isoUtc: string): string {
  return dayjs(isoUtc).tz(DISPLAY_TIMEZONE).format('DD/MM/YYYY');
}

/** Số ngày thuê, làm tròn lên — thuê 25 tiếng tính 2 ngày. */
export function rentalDays(startIsoUtc: string, endIsoUtc: string): number {
  const diffHours = dayjs(endIsoUtc).diff(dayjs(startIsoUtc), 'hour', true);
  return Math.max(1, Math.ceil(diffHours / 24));
}

/** Ngày hôm nay dạng `YYYY-MM-DD` theo giờ VN — giá trị mặc định của filter. */
export function todayIsoDate(): string {
  return dayjs().tz(DISPLAY_TIMEZONE).format('YYYY-MM-DD');
}
