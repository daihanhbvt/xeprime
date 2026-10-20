import type { AppLocale, components } from '@xeprime/types';
import { REVALIDATE_CATALOG_SECONDS } from '@/constants/cache';
import { apiGet, getApiBaseUrl } from '@/services/api-client';
import {
  EMPTY_CATALOG,
  groupCatalog,
  localizeCatalog,
  type CatalogItem,
  type CatalogMap,
} from './types';

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
 *
 * `locale` BẮT BUỘC: nhãn trả về đã chọn đúng ngôn ngữ của request (`localizeCatalog`) — quên
 * truyền là lỗi biên dịch, không phải một trang tiếng Anh hiện "Xăng".
 */
export async function fetchCatalogServer(locale: AppLocale): Promise<CatalogMap> {
  try {
    /*
     * Response chở CẢ HAI ngôn ngữ nên hai ngôn ngữ dùng chung một bản cache; chọn nhãn ở dưới.
     * `cache: 'force-cache'` khai tường minh vì root layout đặt `dynamic = 'force-dynamic'`
     * (ADR 0012): route render theo request, nhưng lời gọi này thì không cần.
     */
    const res = await fetch(`${getApiBaseUrl()}/catalog`, {
      cache: 'force-cache',
      next: { revalidate: REVALIDATE_CATALOG_SECONDS },
    });
    if (!res.ok) return EMPTY_CATALOG;
    const body = (await res.json()) as { data: CatalogItem[] };
    return localizeCatalog(groupCatalog(body.data), locale);
  } catch {
    return EMPTY_CATALOG;
  }
}

/** Mẫu xe của danh mục — bảng riêng, nên có API riêng (xem `CatalogModelDto` ở backend). */
export type CatalogModel = components['schemas']['CatalogModelDto'];

export interface CatalogModelQuery {
  vehicleType: string;
  brandKey?: string;
  search?: string;
  /** Mẫu đang gắn với xe đang sửa — luôn có mặt trong kết quả kể cả khi đã tắt. */
  includeId?: string;
}

export const catalogModelApi = {
  async list(query: CatalogModelQuery): Promise<CatalogModel[]> {
    return apiGet<CatalogModel[]>('/catalog/models', {
      vehicleType: query.vehicleType,
      ...(query.brandKey ? { brandKey: query.brandKey } : {}),
      ...(query.search ? { search: query.search } : {}),
      ...(query.includeId ? { includeId: query.includeId } : {}),
    });
  },
};
