import dayjs, { type Dayjs } from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

import type { IsoDateTimeString } from '@xeprime/types';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

/**
 * CLAUDE.md mục 9: lưu UTC, hiển thị Asia/Ho_Chi_Minh.
 *
 * Đây là chỗ duy nhất extend dayjs. Component nào cần format thì import từ file này, đừng
 * `import dayjs from 'dayjs'` trực tiếp — plugin sẽ không được nạp và `.tz()` sẽ nổ lúc chạy.
 */
export const APP_TIME_ZONE = 'Asia/Ho_Chi_Minh';

export const DATE_FORMAT = 'DD/MM/YYYY';
export const TIME_FORMAT = 'HH:mm';
export const DATE_TIME_FORMAT = 'DD/MM/YYYY HH:mm';

/** Tham số URL của lịch: tháng `YYYY-MM`, ngày `YYYY-MM-DD` (đều theo giờ Việt Nam). */
export const MONTH_PARAM_FORMAT = 'YYYY-MM';
export const DAY_PARAM_FORMAT = 'YYYY-MM-DD';

const EMPTY_PLACEHOLDER = '—';

export function toAppTz(value: IsoDateTimeString | number | Date | Dayjs): Dayjs {
  return dayjs(value).tz(APP_TIME_ZONE);
}

/** 00:00 của một ngày `YYYY-MM-DD` theo giờ Việt Nam, trả về mốc thời gian tuyệt đối. */
export function startOfAppDay(day: string): Dayjs {
  return dayjs.tz(`${day}T00:00:00`, APP_TIME_ZONE);
}

export function formatDate(value: IsoDateTimeString | null | undefined): string {
  return value ? toAppTz(value).format(DATE_FORMAT) : EMPTY_PLACEHOLDER;
}

export function formatTime(value: IsoDateTimeString | null | undefined): string {
  return value ? toAppTz(value).format(TIME_FORMAT) : EMPTY_PLACEHOLDER;
}

export function formatDateTime(value: IsoDateTimeString | null | undefined): string {
  return value ? toAppTz(value).format(DATE_TIME_FORMAT) : EMPTY_PLACEHOLDER;
}

export function formatDateTimeRange(
  from: IsoDateTimeString | null | undefined,
  to: IsoDateTimeString | null | undefined,
): string {
  return `${formatDateTime(from)} → ${formatDateTime(to)}`;
}

export { dayjs };
export type { Dayjs };
