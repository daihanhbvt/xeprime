import { apiGet, getApiBaseUrl } from '@/services/api-client';
import { EMPTY_CATALOG, groupCatalog, type CatalogItem, type CatalogMap } from './types';

/** Client component: đi qua `apiGet` để dùng chung cookie/interceptor lỗi. */
export async function fetchCatalog(): Promise<CatalogMap> {
  return groupCatalog(await apiGet<CatalogItem[]>('/catalog'));
}

/**
 * Server component: fetch thẳng, `revalidate` 5 phút.
 *
 * Danh mục đổi vài lần một tháng nên cache được; 5 phút là khoảng để admin sửa xong còn thấy
 * kết quả trong một phiên làm việc. Lỗi thì trả map rỗng — trang vẫn dựng được, chỉ là nhãn
 * rơi về key thô, không sập cả màn vì một danh mục.
 */
export async function fetchCatalogServer(): Promise<CatalogMap> {
  try {
    /*
     * Dữ liệu này KHÔNG phụ thuộc ngôn ngữ nên hai ngôn ngữ dùng chung một bản cache.
     * `cache: 'force-cache'` khai tường minh vì root layout đặt `dynamic = 'force-dynamic'`
     * (ADR 0012): route render theo request, nhưng lời gọi này thì không cần.
     */
    const res = await fetch(`${getApiBaseUrl()}/catalog`, {
      cache: 'force-cache',
      next: { revalidate: 300 },
    });
    if (!res.ok) return EMPTY_CATALOG;
    const body = (await res.json()) as { data: CatalogItem[] };
    return groupCatalog(body.data);
  } catch {
    return EMPTY_CATALOG;
  }
}
