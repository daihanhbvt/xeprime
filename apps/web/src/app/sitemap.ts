import type { MetadataRoute } from 'next';
import { ROUTES, listingPath, shopPath } from '@/constants/routes';
import { fetchSitemapListingIds, fetchSitemapShopSlugs } from '@/features/marketplace/api';
import { absoluteUrl } from '@/lib/seo';
import { servesMarketSeo } from '@/lib/seo.server';

/**
 * `sitemap.xml` của site khách — chỉ những trang ĐƯỢC index: trang chủ, trang nội dung công khai,
 * từng xe và từng gian hàng. `/search` (noindex: vô số tổ hợp bộ lọc) và khu cần phiên không có
 * ở đây.
 *
 * Host partner/admin và staging nhận sitemap rỗng — cùng luật với `robots.ts`.
 *
 * Không khai `lastModified`: API công khai chưa trả mốc cập nhật của xe, và một mốc bịa (giờ
 * render) dạy bot bỏ qua trường này trên cả site.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!(await servesMarketSeo())) return [];

  const [listingIds, shopSlugs] = await Promise.all([
    fetchSitemapListingIds(),
    fetchSitemapShopSlugs(),
  ]);

  return [
    { url: absoluteUrl(ROUTES.HOME), changeFrequency: 'daily', priority: 1 },
    { url: absoluteUrl(ROUTES.ABOUT), changeFrequency: 'monthly', priority: 0.5 },
    { url: absoluteUrl(ROUTES.LIST_YOUR_VEHICLE.ROOT), changeFrequency: 'monthly', priority: 0.5 },
    ...listingIds.map((id) => ({
      url: absoluteUrl(listingPath.detail(id)),
      changeFrequency: 'daily' as const,
      priority: 0.8,
    })),
    ...shopSlugs.map((slug) => ({
      url: absoluteUrl(shopPath.detail(slug)),
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    })),
  ];
}
