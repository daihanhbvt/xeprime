import { CATALOG_TYPE, type CatalogItemType } from '@xeprime/types';
import { catalogLabel, groupCatalog, type CatalogItem, type CatalogMap } from './types';

/**
 * Danh mục giả cho test — bản rút gọn của dữ liệu migration nạp sẵn.
 *
 * Có một mục ĐÃ TẮT (`cargo`) để test được nhánh "mục tắt không hiện ở ô chọn nhưng xe cũ vẫn
 * hiển thị đúng tên" mà không phải dựng riêng fixture khác.
 *
 * `vehicleTypes` khai đủ ba hình thái có thật: hãng chỉ bán ô tô (Toyota), hãng chỉ bán xe máy
 * (Yamaha), và mục chưa gắn nhãn — mảng rỗng = dùng cho mọi loại. Thiếu hình thái thứ ba thì
 * test sẽ không bắt được lỗi "lọc quá tay làm biến mất mục admin vừa thêm".
 */
export const CATALOG_ITEMS: CatalogItem[] = [
  item(CATALOG_TYPE.VEHICLE_BRAND, 'toyota', 'Toyota', 0, null, null, true, ['car']),
  item(CATALOG_TYPE.VEHICLE_BRAND, 'kia', 'Kia', 1, null, null, true, ['car']),
  item(CATALOG_TYPE.VEHICLE_BRAND, 'vinfast', 'VinFast', 2, null, null, true, ['car', 'motorbike']),
  item(CATALOG_TYPE.VEHICLE_BRAND, 'yamaha', 'Yamaha', 3, null, null, true, ['motorbike']),
  item(CATALOG_TYPE.BODY_TYPE, 'sedan', 'Sedan', 0, '4 chỗ', '/body-types/sedan.png', true, ['car']),
  item(CATALOG_TYPE.BODY_TYPE, 'suv', 'SUV', 1, '7 chỗ · gầm cao', '/body-types/suv.png', true, [
    'car',
  ]),
  item(CATALOG_TYPE.BODY_TYPE, 'cargo', 'Xe tải – Cargo', 2, 'Xe tải', null, false, ['car']),
  item(CATALOG_TYPE.FUEL_TYPE, 'gasoline', 'Xăng', 0),
  item(CATALOG_TYPE.FUEL_TYPE, 'electric', 'Điện', 1),
  item(CATALOG_TYPE.VEHICLE_FEATURE, 'bluetooth', 'Bluetooth', 0),
  item(CATALOG_TYPE.VEHICLE_FEATURE, 'gps', 'Định vị GPS', 1),
  item(CATALOG_TYPE.VEHICLE_FEATURE, 'airbag', 'Túi khí an toàn', 2, null, null, true, ['car']),
  item(CATALOG_TYPE.VEHICLE_FEATURE, 'helmet_included', 'Kèm mũ bảo hiểm', 3, null, null, true, [
    'motorbike',
  ]),
];

function item(
  type: CatalogItemType,
  key: string,
  label: string,
  sortOrder: number,
  description: string | null = null,
  iconUrl: string | null = null,
  active = true,
  vehicleTypes: CatalogItem['vehicleTypes'] = [],
): CatalogItem {
  return {
    id: `cat-${type}-${key}`,
    type,
    key,
    label,
    description,
    iconUrl,
    sortOrder,
    active,
    vehicleTypes,
  };
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
    useCatalogItems: (type: CatalogItemType) => ({ items: CATALOG_FIXTURE[type], isLoading: false }),
    useCatalogLabels: () => labels,
    useCatalogOptions: (type: CatalogItemType, current?: string | null) => {
      const options = CATALOG_FIXTURE[type].map((i) => ({ value: i.key, label: i.label }));
      if (current && !options.some((o) => o.value === current)) {
        options.push({ value: current, label: `${current} (đã ngừng dùng)` });
      }
      return options;
    },
  };
}

/**
 * Mẫu xe giả — hai hãng, hai loại phương tiện, và một mẫu đời trước.
 *
 * Đủ để test được ba luật của cặp chọn phụ thuộc: lọc theo hãng, tách nhóm đang bán / đời trước,
 * và mẫu thuộc loại xe khác thì không lọt vào danh sách.
 */
export const CATALOG_MODELS_FIXTURE = [
  model('m-toyota-vios', 'toyota-vios', 'Vios', 'toyota', 'car'),
  model('m-toyota-innova-cross', 'toyota-innova-cross', 'Innova Cross', 'toyota', 'car'),
  model('m-toyota-innova', 'toyota-innova', 'Innova', 'toyota', 'car', 'legacy'),
  model('m-yamaha-sirius', 'yamaha-sirius', 'Sirius', 'yamaha', 'motorbike', 'current', 'underbone'),
  model('m-yamaha-janus', 'yamaha-janus', 'Janus', 'yamaha', 'motorbike', 'current', 'scooter'),
];

function model(
  id: string,
  key: string,
  label: string,
  brandKey: string,
  vehicleType: string,
  marketStatus = 'current',
  motorbikeCategory: string | null = null,
) {
  return {
    id,
    key,
    label,
    brandKey,
    vehicleType,
    marketStatus,
    motorbikeCategory,
    fuelTypes: [],
    transmissions: [],
    engineDisplacementCc: null,
    seatCount: null,
    yearFrom: null,
    yearTo: null,
    active: true,
  };
}

/**
 * Thân mock cho `vi.mock('@/features/catalog/use-catalog-models')`.
 *
 * Cần tách khỏi `catalogModuleMock` vì đây là module khác, và vì nó gọi TanStack Query — một màn
 * hình chỉ hỏi "danh mục có gì" không nên vì thế mà phải dựng cả `QueryClientProvider`.
 */
export function catalogModelsModuleMock() {
  return {
    useCatalogModels: (params: { vehicleType: string; brandKey?: string | null }) => ({
      models: CATALOG_MODELS_FIXTURE.filter(
        (m) =>
          m.vehicleType === params.vehicleType &&
          (!params.brandKey || m.brandKey === params.brandKey),
      ),
      isLoading: false,
    }),
    useCatalogModelGroups: (models: readonly { id: string; label: string; marketStatus: string }[]) =>
      ['current', 'legacy']
        .map((marketStatus) => ({
          marketStatus,
          options: models
            .filter((m) => m.marketStatus === marketStatus)
            .map((m) => ({ value: m.id, label: m.label })),
        }))
        .filter((group) => group.options.length > 0),
  };
}
