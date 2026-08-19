import type { formats } from '@/i18n/formats';
import type { AppLocale } from '@/i18n/config';
import type { AppMessages } from '@/i18n/messages';

/**
 * Gắn cấu hình đa ngữ của app vào next-intl.
 *
 * Nhờ khai báo này, `t('Common.actions.save')` được KIỂM TRA LÚC TYPECHECK: gõ sai khoá hay
 * dùng khoá chỉ có ở một ngôn ngữ là lỗi biên dịch, không phải một chuỗi thô lọt ra giao diện.
 * Với 33 namespace thì đây là hàng rào rẻ nhất giữ hai bó message không trôi khỏi nhau —
 * `pnpm i18n:check` bắt phần còn lại (parity hai chiều, ICU, giá trị rỗng).
 *
 * Cấu trúc khoá lấy từ tiếng Việt: đó là ngôn ngữ CHUẨN của repo, tiếng Anh phải khớp nó.
 */
declare module 'next-intl' {
  interface AppConfig {
    Locale: AppLocale;
    Messages: AppMessages;
    Formats: typeof formats;
  }
}
