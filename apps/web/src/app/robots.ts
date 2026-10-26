import type { MetadataRoute } from 'next';
import { PAYMENT_NATIVE_TRIP_RETURN_PATH } from '@xeprime/types';
import { ROUTES } from '@/constants/routes';
import { SITEMAP_PATH, absoluteUrl } from '@/lib/seo';
import { servesMarketSeo } from '@/lib/seo.server';

/**
 * Khu riêng tư của site khách: cần phiên, không có gì để index, và mỗi lượt bot ghé là một lượt
 * render vô ích. Trang công khai nhưng `noindex` (`/search`, `/support`…) KHÔNG nằm ở đây: bot
 * phải vào được mới đọc được `noindex` và đi theo liên kết tới trang xe.
 *
 * Luật robots.txt khớp theo TIỀN TỐ: `/account` phủ cả `/account/...`.
 */
const PRIVATE_PATHS = [
  '/api/',
  ROUTES.ACCOUNT.ROOT,
  ROUTES.TRIPS,
  ROUTES.CHAT,
  ROUTES.PAYMENT,
  PAYMENT_NATIVE_TRIP_RETURN_PATH,
];

/**
 * `robots.txt` — một file cho cả ba host (ADR 0051), nên nội dung theo host của request:
 * site khách mở crawl + trỏ sitemap; site partner/admin và mọi bản không phải production
 * (staging) chặn toàn bộ.
 *
 * `proxy.ts` không chạy cho `*.txt` (matcher bỏ qua), nên trên host partner/admin request này tới
 * thẳng đây, không bị rewrite vào `/manage` · `/admin`.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  if (!(await servesMarketSeo())) {
    return { rules: { userAgent: '*', disallow: '/' } };
  }
  return {
    rules: { userAgent: '*', allow: '/', disallow: PRIVATE_PATHS },
    sitemap: absoluteUrl(SITEMAP_PATH),
  };
}
