export const LOCALES = ['vi', 'en'] as const;

export type AppLocale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = 'vi';

/** ADR 0012: tiền luôn VND, thời gian luôn giờ Việt Nam — không theo múi giờ của máy. */
export const APP_TIME_ZONE = 'Asia/Ho_Chi_Minh';

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}
