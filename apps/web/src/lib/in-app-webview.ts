import { headers } from 'next/headers';
import { CUSTOMER_APP_WEBVIEW_UA_TOKEN } from '@xeprime/types';

/**
 * Trang đang được mở trong WebView của APP KHÁCH (User-Agent mang `CUSTOMER_APP_WEBVIEW_UA_TOKEN`).
 * Khi đúng, các trang nội dung dùng biến thể câu `*InApp` không nhắc gói/thuê bao (né IAP).
 * Đọc `headers()` ⇒ trang thành dynamic — các trang dùng nó vốn đã dynamic vì locale đọc cookie.
 */
export async function isCustomerAppWebView(): Promise<boolean> {
  const userAgent = (await headers()).get('user-agent') ?? '';
  return userAgent.includes(CUSTOMER_APP_WEBVIEW_UA_TOKEN);
}
