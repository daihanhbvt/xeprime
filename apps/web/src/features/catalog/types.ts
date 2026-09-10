import type { CatalogItemType, components } from '@xeprime/types';

/**
 * Shape và bộ tra nhãn danh mục — bản của WEB.
 *
 * ADR 0031: web và app native giữ bản riêng của tầng gọi API. App native có bản của nó ở
 * `apps/mobile/src/api/catalog/index.ts`; đổi hình dạng danh mục (thêm một chiều mới chẳng hạn)
 * thì phải sửa CẢ HAI — đây là đánh đổi đã chốt, không phải chỗ quên đồng bộ.
 */

/** Shape từ OpenAPI (ADR 0007) — không viết tay lại. */
export type CatalogItem = components['schemas']['CatalogItemDto'];

/** Danh mục đã gom theo chiều — dạng mọi màn hình tiêu thụ. */
export type CatalogMap = Readonly<Record<CatalogItemType, readonly CatalogItem[]>>;

/** Bản quản trị chỉ web dùng (màn danh mục hệ thống) — không có ở app native. */
export type CatalogItemAdmin = components['schemas']['CatalogItemAdminDto'];

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
