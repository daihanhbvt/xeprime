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
 * Đây là chỗ duy nhất extend dayjs. Component nào cần tính toán ngày giờ thì import từ file
 * này, đừng `import dayjs from 'dayjs'` trực tiếp — plugin sẽ không được nạp và `.tz()` sẽ nổ
 * lúc chạy.
 *
 * File này CỐ Ý chỉ còn phần KHÔNG phụ thuộc ngôn ngữ: múi giờ, phép quy đổi, và các mẫu định
 * dạng dùng cho THAM SỐ URL (thứ phải giữ nguyên ở mọi ngôn ngữ). Mọi chuỗi ngày giờ hiện ra
 * cho người đọc đi qua `useAppFormat()` — xem `src/i18n/use-app-format.ts`.
 *
 * `dayjs.locale(...)` KHÔNG được gọi ở đâu trong app: nó đổi trạng thái toàn tiến trình và sẽ
 * rò ngôn ngữ giữa các request đang render song song trên server.
 */
export const APP_TIME_ZONE = 'Asia/Ho_Chi_Minh';

export const TIME_FORMAT = 'HH:mm';

/**
 * Tham số URL của lịch: tháng `YYYY-MM`, ngày `YYYY-MM-DD` (đều theo giờ Việt Nam).
 * Đây là DỮ LIỆU, không phải chữ — không bao giờ đổi theo ngôn ngữ.
 */
export const MONTH_PARAM_FORMAT = 'YYYY-MM';
export const DAY_PARAM_FORMAT = 'YYYY-MM-DD';

export function toAppTz(value: IsoDateTimeString | number | Date | Dayjs): Dayjs {
  return dayjs(value).tz(APP_TIME_ZONE);
}

/** 00:00 của một ngày `YYYY-MM-DD` theo giờ Việt Nam, trả về mốc thời gian tuyệt đối. */
export function startOfAppDay(day: string): Dayjs {
  return dayjs.tz(`${day}T00:00:00`, APP_TIME_ZONE);
}

/** Phần ngày/giờ của một thời lượng thuê — con số thuần, chưa có chữ. */
export interface RentalDurationParts {
  readonly days: number;
  readonly hours: number;
}

/**
 * Đếm thời lượng một chuyến thuê.
 *
 * CHỈ để hiển thị. Số ngày TÍNH TIỀN do server quyết (`PricingService.chargedDays`); ghép hai
 * phép đếm ở hai nơi là cách chắc chắn nhất để màn hình nói một đằng hoá đơn một nẻo.
 * Làm tròn theo phút để 23h59 không thành "0 ngày".
 *
 * Trả về CON SỐ chứ không phải câu: "2 ngày 4 giờ" / "2 days 4 hours" là việc của message
 * (ICU lo số nhiều), còn phép đếm thì giống nhau ở mọi ngôn ngữ.
 */
export function rentalDurationParts(from: Dayjs, to: Dayjs): RentalDurationParts {
  const minutes = Math.max(0, to.diff(from, 'minute'));
  const days = Math.floor(minutes / 1440);
  const hours = Math.round((minutes % 1440) / 60);
  return days <= 0 ? { days: 0, hours: Math.max(1, hours) } : { days, hours };
}

export { dayjs };
export type { Dayjs };
