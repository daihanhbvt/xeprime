import type { AppLocale, CatalogItemType, components } from '@xeprime/types';

/**
 * Shape và bộ tra nhãn danh mục — bản của WEB.
 *
 * ADR 0031: web và app native giữ bản riêng của tầng gọi API. App native có bản của nó ở
 * `apps/mobile/shared/src/api/catalog/index.ts`; đổi hình dạng danh mục (thêm một chiều mới chẳng
 * hạn) thì phải sửa CẢ HAI — đây là đánh đổi đã chốt, không phải chỗ quên đồng bộ.
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

/**
 * Nhãn theo NGÔN NGỮ đang hiển thị (ADR 0012). `/catalog` chở cả hai bản (`label` tiếng Việt +
 * `labelEn`), nên cache của danh mục vẫn dùng chung cho hai ngôn ngữ; ở đây chọn bản cần hiện.
 * Mục chưa có bản tiếng Anh (tên hãng là tên riêng) giữ nguyên nhãn gốc.
 *
 * Chọn MỘT lần ở tầng dữ liệu (`useCatalog`, `fetchCatalogServer`) — mọi chỗ đang đọc `item.label`
 * / `catalogLabel` tự đúng ngôn ngữ, không nơi nào phải nhớ tự chọn.
 */
export function localizeCatalogItem(item: CatalogItem, locale: AppLocale): CatalogItem {
  if (locale !== 'en') return item;
  return {
    ...item,
    label: item.labelEn ?? item.label,
    description: item.descriptionEn ?? item.description,
  };
}

/** `localizeCatalogItem` cho cả map. */
export function localizeCatalog(catalog: CatalogMap, locale: AppLocale): CatalogMap {
  if (locale !== 'en') return catalog;
  const localized: Record<string, CatalogItem[]> = {};
  for (const [type, items] of Object.entries(catalog)) {
    localized[type] = items.map((item) => localizeCatalogItem(item, locale));
  }
  return localized as unknown as CatalogMap;
}

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

/**
 * Mục danh mục có áp dụng cho loại phương tiện này không. `vehicleTypes` RỖNG = áp dụng mọi loại
 * (cột `catalog_items.vehicle_types`); chưa biết loại xe (`undefined`) thì mọi mục đều hợp lệ.
 *
 * Đây là câu trả lời của DỮ LIỆU cho "Piaggio chỉ có xe máy, Honda có cả hai" — không nơi nào
 * được giữ một danh sách hãng tay song song với nó.
 */
export function catalogItemAppliesTo(
  item: Pick<CatalogItem, 'vehicleTypes'>,
  vehicleType: string | null | undefined,
): boolean {
  if (!vehicleType || item.vehicleTypes.length === 0) return true;
  return (item.vehicleTypes as readonly string[]).includes(vehicleType);
}
