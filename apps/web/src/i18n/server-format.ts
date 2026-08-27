import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { createAppFormat, type AppFormat, type CommonTranslator } from './app-format';
import { resolveAppLocale } from './config';
import { createDomainLabel } from './domain';

/**
 * Bộ định dạng cho SERVER Component.
 *
 * Cùng một hiện thực với `useAppFormat()` (`createAppFormat`), chỉ khác nguồn lấy ngôn ngữ và
 * formatter. Nhờ vậy một trang render ở server không phải đảo sang client chỉ để in một mốc
 * ngày hay một số tiền — điều quan trọng ở khu công khai, nơi nội dung cần được index.
 *
 *   const fmt = await getAppFormat();
 *   <span>{fmt.date(review.createdAt)}</span>
 */
export async function getAppFormat(): Promise<AppFormat> {
  const [locale, format, t, tDomain] = await Promise.all([
    getLocale(),
    getFormatter(),
    getTranslations('Common'),
    getTranslations('Domain'),
  ]);

  /*
   * `getTranslations` và `useTranslations` trả về cùng một bộ hàm nhưng TypeScript mô tả chúng
   * bằng hai kiểu riêng (một bên async-aware). Ép kiểu đúng một lần ở đây, thay vì bắt
   * `createAppFormat` nhận một union rồi mỗi lời gọi bên trong phải tự thu hẹp.
   */
  return createAppFormat(
    resolveAppLocale(locale),
    format,
    t as unknown as CommonTranslator,
    createDomainLabel(tDomain as never),
  );
}
