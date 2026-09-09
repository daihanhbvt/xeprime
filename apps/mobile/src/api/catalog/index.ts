import type { CatalogItemType, components } from '@xeprime/types';
import { getApiClient } from '@xeprime/api-client';

/** Shape từ OpenAPI (ADR 0007) — không viết tay lại. */
export type CatalogItem = components['schemas']['CatalogItemDto'];

/** Danh mục đã gom theo chiều — dạng mọi màn hình tiêu thụ. */
export type CatalogMap = Readonly<Record<CatalogItemType, readonly CatalogItem[]>>;

export const EMPTY_CATALOG: CatalogMap = {
  vehicle_brand: [],
  body_type: [],
  fuel_type: [],
  vehicle_feature: [],
};

/** Gom danh sách phẳng của API thành map theo chiều, giữ nguyên thứ tự admin đã sắp. */
export function groupCatalog(items: readonly CatalogItem[]): CatalogMap {
  const grouped: Record<string, CatalogItem[]> = {
    vehicle_brand: [],
    body_type: [],
    fuel_type: [],
    vehicle_feature: [],
  };
  for (const item of items) grouped[item.type]?.push(item);
  return grouped as unknown as CatalogMap;
}

/**
 * Tra nhãn từ key. Fallback về chính key khi danh mục chưa tải xong hoặc mục đã bị xoá —
 * thà hiện `suv` còn hơn ô trống, và không bao giờ ném lỗi giữa lúc render.
 */
export function catalogLabel(
  items: readonly CatalogItem[] | undefined,
  key: string | null | undefined,
): string | null {
  if (!key) return null;
  // `items` có thể vắng khi nơi gọi tra một chiều chưa có trong map — vẫn phải trả về key,
  // đúng như lời hứa ở trên, thay vì nổ giữa lúc render.
  return items?.find((item) => item.key === key)?.label ?? key;
}

export const catalogApi = {
  async list(): Promise<CatalogMap> {
    return groupCatalog(await getApiClient().get<CatalogItem[]>('/catalog'));
  },
};

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
    return getApiClient().get<CatalogModel[]>('/catalog/models', {
      vehicleType: query.vehicleType,
      ...(query.brandKey ? { brandKey: query.brandKey } : {}),
      ...(query.search ? { search: query.search } : {}),
      ...(query.includeId ? { includeId: query.includeId } : {}),
    });
  },
};
