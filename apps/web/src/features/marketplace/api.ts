import {
  REVALIDATE_LISTING_SECONDS,
  REVALIDATE_REVIEWS_SECONDS,
  REVALIDATE_SHOP_SECONDS,
  REVALIDATE_SITEMAP_SECONDS,
} from '@/constants/cache';
import type { GeoPoint } from '@xeprime/domain';
import { staticMapHref } from '@/lib/api-href';
import { apiGet, apiRequest, getApiBaseUrl } from '@/services/api-client';
import type {
  ListingSort,
  PublicListing,
  PublicListingDetail,
  PublicShop,
  PublicShopSummary,
  ReviewPage,
  ShopReviewPage,
} from './types';

/**
 * Cùng dữ liệu với `fetchListingDetail` nhưng gọi TỪ TRÌNH DUYỆT (qua `apiGet`, có cookie).
 *
 * Dùng khi overlay yêu cầu thuê được mở từ một thẻ xe: thẻ chỉ có dữ liệu tóm tắt, còn cột hồ
 * sơ xe cần ảnh gallery/tiện ích/gian hàng. Mở từ trang chi tiết thì listing đã có sẵn và
 * KHÔNG gọi lại.
 */
export const fetchListingDetailClient = (id: string): Promise<PublicListingDetail> =>
  apiGet<PublicListingDetail>(`/public/listings/${encodeURIComponent(id)}`);

/**
 * Vài đánh giá tiêu biểu của một xe, gọi TỪ TRÌNH DUYỆT — dùng cho cột gian hàng trong overlay
 * yêu cầu thuê.
 *
 * Endpoint trả sẵn `{ summary, data, meta }` nên KHÔNG dùng `apiGet` (nó bóc mất `summary`);
 * `apiRequest` giữ nguyên cả phong bì.
 */
export async function fetchListingReviewsClient(
  vehicleId: string,
  limit: number,
): Promise<ReviewPage> {
  const res = await apiRequest<ReviewPage['data']>(
    `/public/listings/${encodeURIComponent(vehicleId)}/reviews`,
    { query: { limit } },
  );
  return res as unknown as ReviewPage;
}

/**
 * Lấy chi tiết một xe public — gọi server-side cho trang `/listings/[id]` (SEO).
 * Trả `null` khi không tìm thấy → `notFound()`.
 *
 * Trước đây `no-store` "để giá/trạng thái luôn mới". Đổi sang cache 30 giây vì cái giá của
 * `no-store` không nằm ở đây mà ở tải: trang này là đích của mọi liên kết từ chợ và từ công cụ
 * tìm kiếm, page gọi hàm này CẢ trong `generateMetadata` lẫn khi render, và root layout thì
 * không cho phép prerender (ADR 0012) — nên mỗi lượt xem là một lượt chạm API.
 *
 * 30 giây không nới lỏng gì về đúng đắn: giá hiển thị ở đây là để tham khảo, còn giá THẬT của
 * một đơn do backend tính lại lúc gửi yêu cầu thuê (một nguồn giá — `PricingService`). Xe vừa bị
 * ẩn thì trang còn hiện thêm nửa phút, nhưng bước đặt xe vẫn từ chối.
 */
export async function fetchListingDetail(id: string): Promise<PublicListingDetail | null> {
  const res = await fetch(`${getApiBaseUrl()}/public/listings/${encodeURIComponent(id)}`, {
    cache: 'force-cache',
    next: { revalidate: REVALIDATE_LISTING_SECONDS },
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { data: PublicListingDetail };
  return body.data;
}

/**
 * Đánh giá công khai của một xe (server-side cho trang chi tiết, SEO). Endpoint trả sẵn
 * `{ summary, data, meta }` nên không bị bọc thêm lớp `data` (ResponseInterceptor).
 * Trả `null` khi lỗi để phần đánh giá tự ẩn, không làm hỏng cả trang.
 */
export async function fetchListingReviews(vehicleId: string): Promise<ReviewPage | null> {
  const res = await fetch(
    `${getApiBaseUrl()}/public/listings/${encodeURIComponent(vehicleId)}/reviews`,
    { cache: 'force-cache', next: { revalidate: REVALIDATE_REVIEWS_SECONDS } },
  );
  if (!res.ok) return null;
  return (await res.json()) as ReviewPage;
}

/**
 * Hồ sơ gian hàng công khai — gọi server-side cho trang `/shops/[slug]` (SEO).
 * Trả `null` khi shop không tồn tại / không active (404) → trang gọi `notFound()`.
 *
 * Mốc `shop` (60s) chứ không phải `catalog` (300s): hồ sơ do chủ shop TỰ SỬA và không có đường
 * revalidateTag (mutation không đi qua Next) — cũ 5 phút là chủ shop tưởng lưu không ăn.
 */
export async function fetchPublicShop(slug: string): Promise<PublicShop | null> {
  const res = await fetch(`${getApiBaseUrl()}/public/shops/${encodeURIComponent(slug)}`, {
    cache: 'force-cache',
    next: { revalidate: REVALIDATE_SHOP_SECONDS },
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { data: PublicShop };
  return body.data;
}

/**
 * Đánh giá công khai của một GIAN HÀNG (mọi xe) — gọi server-side cho trang `/shops/[slug]`.
 *
 * Cùng khuôn với `fetchListingReviews`: endpoint đã trả sẵn `{ summary, data, meta }` nên không
 * bị `ResponseInterceptor` bọc thêm một lớp `data` nữa, và lỗi cho ra `null` để khối đánh giá
 * tự ẩn thay vì làm hỏng cả trang gian hàng.
 *
 * Chỉ lấy trang đầu: đây là bằng chứng xã hội để khách quyết định, không phải một kho lưu trữ —
 * ai muốn đọc hết thì đọc ở trang từng chiếc xe. Trang đầu render ở SERVER nên nội dung đánh
 * giá vẫn được công cụ tìm kiếm index, đúng lý do `/shops` nằm trong route group `(public)`.
 */
export async function fetchShopReviews(
  slug: string,
  limit: number,
): Promise<ShopReviewPage | null> {
  const res = await fetch(
    `${getApiBaseUrl()}/public/shops/${encodeURIComponent(slug)}/reviews?limit=${limit}`,
    { cache: 'force-cache', next: { revalidate: REVALIDATE_REVIEWS_SECONDS } },
  );
  if (!res.ok) return null;
  return (await res.json()) as ShopReviewPage;
}

/** Trần `limit` của `GET /public/listings` và `GET /public/shops` (`@Max(48)` ở DTO API). */
const SITEMAP_PAGE_SIZE = 48;

/**
 * Trần số trang mỗi loại — 200 × 48 = 9.600 mục, dưới xa giới hạn 50.000 URL của một sitemap.
 * Chợ vượt mốc đó thì chuyển sang `generateSitemaps` (sitemap index) thay vì nâng số này.
 */
const SITEMAP_MAX_PAGES = 200;

/** Số trang gọi song song khi quét — đủ nhanh mà không dội một loạt request vào API. */
const SITEMAP_FETCH_CONCURRENCY = 4;

/** `newest` thay vì sort mặc định theo điểm xếp hạng: thứ tự ổn định hơn giữa các trang. */
const SITEMAP_LISTING_SORT: ListingSort = 'newest';

interface PublicPage<T> {
  data: T[];
  meta: { total: number; hasNext: boolean };
}

async function fetchSitemapPage<T>(path: string, query: URLSearchParams): Promise<PublicPage<T> | null> {
  try {
    const res = await fetch(`${getApiBaseUrl()}${path}?${query}`, {
      cache: 'force-cache',
      next: { revalidate: REVALIDATE_SITEMAP_SECONDS },
    });
    if (!res.ok) return null;
    return (await res.json()) as PublicPage<T>;
  } catch {
    return null;
  }
}

/**
 * Quét mọi trang của một danh sách công khai. Trang hỏng thì bỏ qua — sitemap thiếu vài mục vẫn
 * hơn một sitemap 500; trang đầu hỏng thì trả rỗng.
 */
async function collectSitemapItems<T>(
  path: string,
  baseQuery: Record<string, string>,
): Promise<T[]> {
  const queryFor = (page: number) =>
    new URLSearchParams({ ...baseQuery, page: String(page), limit: String(SITEMAP_PAGE_SIZE) });

  const first = await fetchSitemapPage<T>(path, queryFor(1));
  if (!first) return [];
  const pageCount = Math.min(
    Math.ceil(first.meta.total / SITEMAP_PAGE_SIZE),
    SITEMAP_MAX_PAGES,
  );

  const items = [...first.data];
  for (let start = 2; start <= pageCount; start += SITEMAP_FETCH_CONCURRENCY) {
    const pages = Array.from(
      { length: Math.min(SITEMAP_FETCH_CONCURRENCY, pageCount - start + 1) },
      (_, i) => fetchSitemapPage<T>(path, queryFor(start + i)),
    );
    for (const page of await Promise.all(pages)) {
      if (page) items.push(...page.data);
    }
  }
  return items;
}

/** Id mọi xe đang công khai — cho `sitemap.xml`. Không trùng lặp dù thứ tự xê dịch giữa hai trang. */
export async function fetchSitemapListingIds(): Promise<string[]> {
  const listings = await collectSitemapItems<PublicListing>('/public/listings', {
    sort: SITEMAP_LISTING_SORT,
  });
  return [...new Set(listings.map((listing) => listing.id))];
}

/** Slug mọi gian hàng đang hoạt động — cho `sitemap.xml`. */
export async function fetchSitemapShopSlugs(): Promise<string[]> {
  const shops = await collectSitemapItems<PublicShopSummary>('/public/shops', {});
  return [...new Set(shops.map((shop) => shop.slug))];
}

/**
 * Ảnh bản đồ tĩnh của điểm nhận xe trên trang xe (ADR 0061 điều 1). `address` là dòng API in lên
 * ảnh (địa chỉ chi nhánh) — vào phiên bản URL cùng toạ độ.
 */
export function pickupMapSrc(listingId: string, point: GeoPoint, address: string): string {
  return staticMapHref(`/public/listings/${listingId}/pickup-map`, point, address);
}
