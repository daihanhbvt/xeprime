import {
  REVALIDATE_LISTING_SECONDS,
  REVALIDATE_REVIEWS_SECONDS,
  REVALIDATE_SHOP_SECONDS,
} from '@/constants/cache';
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
