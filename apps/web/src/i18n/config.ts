/**
 * Nguồn sự thật DUY NHẤT của phần đa ngữ: danh sách locale, kiểu, mặc định, tên cookie,
 * hàm hợp lệ hoá và bản đồ locale định dạng.
 *
 * File này CỐ Ý không import gì ngoài `APP_TIME_ZONE`: nó chạy ở cả ba môi trường (Server
 * Component, Client Component, Server Action). Thêm một import nặng ở đây là kéo nó vào mọi
 * bundle.
 *
 * URL KHÔNG mang locale (không `/en`, không `?lang=`) — ngôn ngữ là tuỳ chọn giao diện lưu ở
 * cookie `XP_LOCALE`, đọc phía server trước khi render. Xem `docs/decisions/0012-i18n-shared-url-cookie-locale.md`.
 */

/** Múi giờ ứng dụng — định nghĩa gốc nằm ở `lib/datetime`, re-export để hạ tầng i18n có một cửa. */
export { APP_TIME_ZONE } from '@/lib/datetime';

/**
 * Danh sách locale, mặc định và hàm hợp lệ hoá sống ở `@xeprime/types` từ ADR 0019 — `apps/api`
 * cũng cần chúng để chuyển tiếp ngôn ngữ cho màn đồng ý của Google/Facebook. Re-export ở đây để
 * ~80 chỗ `import … from '@/i18n/config'` không phải đổi, và để hạ tầng i18n của web vẫn có
 * đúng MỘT cửa.
 */
export {
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  isAppLocale,
  resolveAppLocale,
  type AppLocale,
} from '@xeprime/types';

import type { AppLocale } from '@xeprime/types';

export const LOCALE_COOKIE_NAME = 'XP_LOCALE';

/** 365 ngày. Ngôn ngữ là tuỳ chọn dài hạn, không phải trạng thái phiên. */
export const LOCALE_COOKIE_MAX_AGE = 31_536_000;

/**
 * Thuộc tính cookie dùng chung cho Server Action đặt cookie và cho test kiểm chứng.
 * Khai báo MỘT chỗ để test không tự chép lại kỳ vọng rồi trôi khỏi hiện thực.
 */
export const LOCALE_COOKIE_OPTIONS = {
  path: '/',
  sameSite: 'lax',
  maxAge: LOCALE_COOKIE_MAX_AGE,
  /**
   * `httpOnly` được: không có JS client nào cần đọc ngôn ngữ. Locale đã có mặt trong HTML do
   * server render, và bộ chuyển ngôn ngữ nhận locale hiện tại qua `useLocale()` của next-intl
   * chứ không đọc cookie.
   */
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
} as const;

/**
 * Locale dùng cho `Intl.*` (tiền, số, ngày, thời gian tương đối).
 *
 * `vi`/`en` là mã giao diện; `Intl` cần thẻ ngôn ngữ ĐẦY ĐỦ, và `new Intl.NumberFormat('en')`
 * rơi về `en-US` một cách tình cờ chứ không phải theo chủ đích. Ghi rõ ra để định dạng không
 * đổi khi môi trường đổi.
 */
export const FORMAT_LOCALE: Readonly<Record<AppLocale, string>> = {
  vi: 'vi-VN',
  en: 'en-US',
};

/**
 * Đơn vị tiền KHÔNG đổi theo ngôn ngữ. Người dùng đọc tiếng Anh vẫn trả bằng đồng — đổi ký
 * hiệu tiền theo ngôn ngữ giao diện là cách nhanh nhất để một con số bị hiểu sai.
 */
export const APP_CURRENCY = 'VND';
