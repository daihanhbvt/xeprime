import { apiGet, apiRequest, getApiBaseUrl } from '@/services/api-client';
import type { PublicListingDetail, PublicShop, ReviewPage } from './types';

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
 * `cache: 'no-store'` để giá/trạng thái luôn mới; trả `null` khi không tìm thấy → `notFound()`.
 */
export async function fetchListingDetail(id: string): Promise<PublicListingDetail | null> {
  const res = await fetch(`${getApiBaseUrl()}/public/listings/${encodeURIComponent(id)}`, {
    cache: 'no-store',
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
    { cache: 'no-store' },
  );
  if (!res.ok) return null;
  return (await res.json()) as ReviewPage;
}

/**
 * Hồ sơ gian hàng công khai — gọi server-side cho trang `/shops/[slug]` (SEO).
 * Trả `null` khi shop không tồn tại / không active (404) → trang gọi `notFound()`.
 */
export async function fetchPublicShop(slug: string): Promise<PublicShop | null> {
  const res = await fetch(`${getApiBaseUrl()}/public/shops/${encodeURIComponent(slug)}`, {
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { data: PublicShop };
  return body.data;
}
