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
export const SHORT_DATE_TIME_FORMAT = 'HH:mm · DD/MM';

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

/** Mốc giờ gọn cho bảng vận hành: `08:00 · 17/08`, bỏ năm để tránh chiếm ngang. */
export function formatShortDateTime(value: IsoDateTimeString | null | undefined): string {
  return value ? toAppTz(value).format(SHORT_DATE_TIME_FORMAT) : EMPTY_PLACEHOLDER;
}

/** Khoảng giờ gọn cho danh sách đơn: `08:00 · 17/08 → 14:00 · 18/08`. */
export function formatShortDateTimeRange(
  from: IsoDateTimeString | null | undefined,
  to: IsoDateTimeString | null | undefined,
): string {
  return `${formatShortDateTime(from)} → ${formatShortDateTime(to)}`;
}

/** Thứ viết tắt kiểu Việt Nam. `Dayjs.day()` trả 0 = Chủ nhật. */
const WEEKDAY_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'] as const;

export function weekdayShort(value: Dayjs): string {
  return WEEKDAY_SHORT[value.day()] ?? '';
}

/**
 * Một MỐC thuê xe: `T6, 08/08 · 10:00`.
 *
 * **Không có năm** là cố ý: đơn thuê xe gần như luôn trong vài tuần tới, nên "2026" chỉ là nhiễu
 * chiếm chỗ; còn THỨ mấy lại là thứ người Việt nghĩ tới đầu tiên khi xếp lịch ("trả xe chủ nhật")
 * và trước đây không hề hiện ra. Khoảng thuê xuyên năm vẫn đọc đúng nhờ ngày/tháng.
 *
 * `withTime: false` cho chế độ thuê theo ngày ở những chỗ chật (giờ đã nằm chỗ khác).
 */
export function formatRentalPoint(value: Dayjs, opts: { withTime?: boolean } = {}): string {
  const { withTime = true } = opts;
  const base = `${weekdayShort(value)}, ${value.format('DD/MM')}`;
  return withTime ? `${base} · ${value.format(TIME_FORMAT)}` : base;
}

/**
 * Thời lượng dạng chữ: `3 ngày` · `5 giờ` · `2 ngày 4 giờ`.
 *
 * CHỈ để hiển thị. Số ngày TÍNH TIỀN do server quyết (`PricingService.chargedDays`); ghép hai
 * phép đếm ở hai nơi là cách chắc chắn nhất để màn hình nói một đằng hoá đơn một nẻo.
 * Làm tròn theo phút để 23h59 không thành "0 ngày".
 */
export function formatRentalDuration(from: Dayjs, to: Dayjs): string {
  const minutes = Math.max(0, to.diff(from, 'minute'));
  const days = Math.floor(minutes / 1440);
  const hours = Math.round((minutes % 1440) / 60);
  if (days <= 0) return `${Math.max(1, hours)} giờ`;
  return hours > 0 ? `${days} ngày ${hours} giờ` : `${days} ngày`;
}

export { dayjs };
export type { Dayjs };
