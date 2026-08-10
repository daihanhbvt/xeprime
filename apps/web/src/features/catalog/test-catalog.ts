import { CATALOG_TYPE, type CatalogType } from '@xeprime/types';
import { catalogLabel, groupCatalog, type CatalogItem, type CatalogMap } from './types';

/**
 * Danh mục giả cho test — bản rút gọn của dữ liệu migration nạp sẵn.
 *
 * Có một mục ĐÃ TẮT (`cargo`) để test được nhánh "mục tắt không hiện ở ô chọn nhưng xe cũ vẫn
 * hiển thị đúng tên" mà không phải dựng riêng fixture khác.
 */
export const CATALOG_ITEMS: CatalogItem[] = [
  item(CATALOG_TYPE.VEHICLE_BRAND, 'toyota', 'Toyota', 0),
  item(CATALOG_TYPE.VEHICLE_BRAND, 'kia', 'Kia', 1),
  item(CATALOG_TYPE.VEHICLE_BRAND, 'vinfast', 'VinFast', 2),
  item(CATALOG_TYPE.BODY_TYPE, 'sedan', 'Sedan', 0, '4 chỗ', '/body-types/sedan.png'),
  item(CATALOG_TYPE.BODY_TYPE, 'suv', 'SUV', 1, '7 chỗ · gầm cao', '/body-types/suv.png'),
  item(CATALOG_TYPE.BODY_TYPE, 'cargo', 'Xe tải – Cargo', 2, 'Xe tải', null, false),
  item(CATALOG_TYPE.FUEL_TYPE, 'gasoline', 'Xăng', 0),
  item(CATALOG_TYPE.FUEL_TYPE, 'electric', 'Điện', 1),
  item(CATALOG_TYPE.VEHICLE_FEATURE, 'bluetooth', 'Bluetooth', 0),
  item(CATALOG_TYPE.VEHICLE_FEATURE, 'gps', 'Định vị GPS', 1),
];

function item(
  type: CatalogType,
  key: string,
  label: string,
  sortOrder: number,
  description: string | null = null,
  iconUrl: string | null = null,
  active = true,
): CatalogItem {
  return { id: `cat-${type}-${key}`, type, key, label, description, iconUrl, sortOrder, active };
}

/** Chỉ mục đang bật — đúng thứ endpoint công khai trả về. */
export const CATALOG_FIXTURE: CatalogMap = groupCatalog(CATALOG_ITEMS.filter((i) => i.active));

/**
 * Thân mock cho `vi.mock('@/features/catalog/use-catalog')`.
 *
 * Trả về đúng shape của module thật, chạy đồng bộ, không cần QueryClientProvider — test màn hình
 * chỉ quan tâm "danh mục có sẵn", không quan tâm nó tới bằng request nào.
 */
export function catalogModuleMock() {
  const labels = {
    brandLabel: (key: string | null | undefined) =>
      catalogLabel(CATALOG_FIXTURE[CATALOG_TYPE.VEHICLE_BRAND], key),
    bodyTypeLabel: (key: string | null | undefined) =>
      catalogLabel(CATALOG_FIXTURE[CATALOG_TYPE.BODY_TYPE], key),
    fuelTypeLabel: (key: string | null | undefined) =>
      catalogLabel(CATALOG_FIXTURE[CATALOG_TYPE.FUEL_TYPE], key),
    featureLabel: (key: string) =>
      catalogLabel(CATALOG_FIXTURE[CATALOG_TYPE.VEHICLE_FEATURE], key) ?? key,
  };

  return {
    useCatalog: () => ({ catalog: CATALOG_FIXTURE, isLoading: false }),
    useCatalogItems: (type: CatalogType) => ({ items: CATALOG_FIXTURE[type], isLoading: false }),
    useCatalogLabels: () => labels,
    useCatalogOptions: (type: CatalogType, current?: string | null) => {
      const options = CATALOG_FIXTURE[type].map((i) => ({ value: i.key, label: i.label }));
      if (current && !options.some((o) => o.value === current)) {
        options.push({ value: current, label: `${current} (đã ngừng dùng)` });
      }
      return options;
    },
  };
}
