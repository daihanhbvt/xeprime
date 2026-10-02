export const LOCALES = ['vi', 'en'] as const;

export type AppLocale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = 'vi';

/** ADR 0012: tiền luôn VND, thời gian luôn giờ Việt Nam — không theo múi giờ của máy. */
export const APP_TIME_ZONE = 'Asia/Ho_Chi_Minh';

/**
 * Locale dùng cho `Intl.*`. `vi`/`en` là mã giao diện; `Intl` cần thẻ ngôn ngữ ĐẦY ĐỦ, và
 * `new Intl.NumberFormat('en')` rơi về `en-US` một cách tình cờ chứ không phải theo chủ đích.
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

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}
