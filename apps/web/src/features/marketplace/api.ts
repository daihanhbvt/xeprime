import { getApiBaseUrl } from '@/services/api-client';
import type { PublicListingDetail } from './types';

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
