import type { AppLocale } from './config';
import type { AppMessages } from './messages';

/**
 * Gắn bó message vào use-intl để `t('...')` được kiểm lúc typecheck — gõ sai một khoá là lỗi
 * biên dịch, không phải chuỗi `Common.actions.rerty` lọt ra bản phát hành.
 */
declare module 'use-intl' {
  interface AppConfig {
    Locale: AppLocale;
    Messages: AppMessages;
  }
}
