import { getApiBaseUrl } from '@/services/api-client';
import type { PublicBanner } from './types';

/**
 * Banner hero cho trang chủ — fetch server-side, cache 60s: admin bật/tắt banner thấy kết quả
 * trong vòng một phút, còn trang chủ không phải đập DB mỗi lượt xem.
 *
 * Lỗi trả mảng RỖNG — trang chủ rơi về hero mặc định, không sập vì một mục marketing.
 */
export async function fetchBannersServer(): Promise<PublicBanner[]> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/public/banners`, { next: { revalidate: 60 } });
    if (!res.ok) return [];
    const body = (await res.json()) as { data: PublicBanner[] };
    return body.data;
  } catch {
    return [];
  }
}
