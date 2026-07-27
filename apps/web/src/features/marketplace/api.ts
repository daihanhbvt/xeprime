import { getApiBaseUrl } from '@/services/api-client';
import type { PublicListingDetail, ReviewPage } from './types';

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
