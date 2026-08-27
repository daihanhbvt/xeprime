import { cookies } from 'next/headers';
import { LOCALE_COOKIE_NAME, resolveAppLocale, type AppLocale } from './config';

/**
 * Ngôn ngữ của request hiện tại, đọc PHÍA SERVER từ cookie `XP_LOCALE`.
 *
 * Chỉ có một lối vào duy nhất này (`next/headers` nên file tự nó đã là server-only). Không đọc
 * `Accept-Language` ở giai đoạn này: khách chưa có cookie luôn thấy tiếng Việt, nhờ vậy HTML
 * công khai trên MỘT url là xác định và index được.
 *
 * Giá trị hỏng/lạ (cookie bị sửa tay, giá trị của bản cũ) rơi về tiếng Việt chứ không nổ —
 * cookie là đầu vào từ client, không phải dữ liệu tin được.
 */
export async function getServerLocale(): Promise<AppLocale> {
  const store = await cookies();
  return resolveAppLocale(store.get(LOCALE_COOKIE_NAME)?.value);
}
