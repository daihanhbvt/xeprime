import { BANNER_PLACEMENT, type BannerPlacement } from '@xeprime/types';
import { REVALIDATE_BANNER_SECONDS } from '@/constants/cache';
import { getApiBaseUrl } from '@/services/api-client';
import type { PublicBanner } from './types';

/**
 * Banner trang chủ của MỘT vị trí (dải đầu trang / khuyến mãi giữa trang) — fetch server-side,
 * cache 60s: admin bật/tắt banner thấy kết quả trong vòng một phút, còn trang chủ không phải đập
 * DB mỗi lượt xem.
 *
 * Lỗi trả mảng RỖNG — trang chủ rơi về khối mặc định (đầu trang) hoặc ẩn khối (khuyến mãi), không
 * sập vì một mục marketing.
 */
export async function fetchBannersServer(
  placement: BannerPlacement = BANNER_PLACEMENT.HERO,
): Promise<PublicBanner[]> {
  try {
    /*
     * Dữ liệu này KHÔNG phụ thuộc ngôn ngữ nên hai ngôn ngữ dùng chung một bản cache.
     * `cache: 'force-cache'` khai tường minh vì root layout đặt `dynamic = 'force-dynamic'`
     * (ADR 0012): route render theo request, nhưng lời gọi này thì không cần.
     */
    const res = await fetch(`${getApiBaseUrl()}/public/banners?placement=${placement}`, {
      cache: 'force-cache',
      next: { revalidate: REVALIDATE_BANNER_SECONDS },
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { data: PublicBanner[] };
    return body.data;
  } catch {
    return [];
  }
}
