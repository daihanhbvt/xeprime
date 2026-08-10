import type { CatalogType, components } from '@xeprime/types';

/** Shape từ OpenAPI (ADR 0007) — không viết tay lại. */
export type CatalogItem = components['schemas']['CatalogItemDto'];
export type CatalogItemAdmin = components['schemas']['CatalogItemAdminDto'];

/** Danh mục đã gom theo chiều — dạng mọi màn hình tiêu thụ. */
export type CatalogMap = Readonly<Record<CatalogType, readonly CatalogItem[]>>;

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
  items: readonly CatalogItem[],
  key: string | null | undefined,
): string | null {
  if (!key) return null;
  return items.find((item) => item.key === key)?.label ?? key;
}
