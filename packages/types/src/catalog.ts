/**
 * Danh mục dữ liệu dùng chung cho bộ lọc — bảng `catalog_items`.
 *
 * Đây KHÔNG phải status (ADR 0005) mà là dữ liệu nghiệp vụ do platform admin quản lý: nội dung
 * từng danh mục nằm ở DB, file này chỉ chốt **tên bốn chiều** (bộ đóng, có CHECK ở migration)
 * cùng nhãn/mô tả cho màn quản trị.
 *
 * Bộ giá trị mặc định của từng chiều đã được nạp trong migration `add_catalog_items`; các hằng số
 * cũ trong `status/vehicle.ts` (`BODY_TYPE_LABEL`, `VEHICLE_BRANDS`, `FUEL_TYPE_LABEL`,
 * `VEHICLE_FEATURE_LABEL`) giữ lại làm **nhãn dự phòng** khi chưa tải được catalog — không còn là
 * nguồn sự thật cho danh sách chọn.
 */
export const CATALOG_TYPE = {
  VEHICLE_BRAND: 'vehicle_brand',
  BODY_TYPE: 'body_type',
  FUEL_TYPE: 'fuel_type',
  VEHICLE_FEATURE: 'vehicle_feature',
  /** Mẫu xe — dữ liệu ở bảng riêng `vehicle_catalog_models`, xem `CATALOG_TYPE_HINT`. */
  VEHICLE_MODEL: 'vehicle_model',
} as const;

export type CatalogType = (typeof CATALOG_TYPE)[keyof typeof CATALOG_TYPE];
export const CATALOG_TYPE_VALUES = Object.values(CATALOG_TYPE) as CatalogType[];

export function isCatalogType(value: unknown): value is CatalogType {
  return typeof value === 'string' && (CATALOG_TYPE_VALUES as string[]).includes(value);
}

export const CATALOG_TYPE_LABEL: Readonly<Record<CatalogType, string>> = {
  [CATALOG_TYPE.VEHICLE_BRAND]: 'Hãng xe',
  [CATALOG_TYPE.BODY_TYPE]: 'Kiểu dáng xe',
  [CATALOG_TYPE.FUEL_TYPE]: 'Nguồn năng lượng',
  [CATALOG_TYPE.VEHICLE_FEATURE]: 'Tiện ích xe',
  [CATALOG_TYPE.VEHICLE_MODEL]: 'Mẫu xe',
};

/** Mô tả dưới tiêu đề tab ở màn quản trị danh mục — nói rõ mục này chạy ra đâu. */
export const CATALOG_TYPE_HINT: Readonly<Record<CatalogType, string>> = {
  [CATALOG_TYPE.VEHICLE_BRAND]: 'Hiện ở ô "Hãng xe" khi tạo/sửa xe và ở bộ lọc ngoài chợ.',
  [CATALOG_TYPE.BODY_TYPE]: 'Hiện thành thẻ có ảnh khi tạo/sửa xe và ở bộ lọc "Loại xe" ngoài chợ.',
  [CATALOG_TYPE.FUEL_TYPE]: 'Hiện ở ô "Nguồn năng lượng" khi tạo/sửa xe và ở bộ lọc ngoài chợ.',
  [CATALOG_TYPE.VEHICLE_FEATURE]: 'Hiện ở phần "Tiện ích" khi tạo/sửa xe và ở bộ lọc ngoài chợ.',
  [CATALOG_TYPE.VEHICLE_MODEL]:
    'Hiện ở ô "Mẫu xe" sau khi chọn hãng. Mỗi mẫu thuộc một hãng và một loại phương tiện.',
};

/**
 * Chiều lưu ở bảng `catalog_items` (khoá + nhãn + thứ tự). `vehicle_model` KHÔNG nằm trong đây:
 * một mẫu xe còn mang hãng, loại phương tiện, khoảng năm sản xuất và nguồn tra cứu, nhồi chúng
 * vào bảng danh mục phẳng thì mọi truy vấn "Honda có xe máy nào" phải parse JSON.
 */
export const CATALOG_ITEM_TYPES: readonly CatalogItemType[] = [
  CATALOG_TYPE.VEHICLE_BRAND,
  CATALOG_TYPE.BODY_TYPE,
  CATALOG_TYPE.FUEL_TYPE,
  CATALOG_TYPE.VEHICLE_FEATURE,
];

/** Chiều lưu ở `catalog_items` — hẹp hơn `CatalogType` đúng một giá trị (`vehicle_model`). */
export type CatalogItemType = Exclude<CatalogType, typeof CATALOG_TYPE.VEHICLE_MODEL>;

export function isCatalogItemType(value: unknown): value is CatalogItemType {
  return typeof value === 'string' && (CATALOG_ITEM_TYPES as string[]).includes(value);
}

/** Chiều nào dùng ảnh minh hoạ — quyết định màn quản trị có hiện ô ảnh hay không. */
export const CATALOG_TYPES_WITH_ICON: readonly CatalogType[] = [
  CATALOG_TYPE.VEHICLE_BRAND,
  CATALOG_TYPE.BODY_TYPE,
];

/**
 * Ràng buộc `key`: slug chữ thường, vì nó đi thẳng vào URL bộ lọc (`?bodyType=suv,cuv`) và vào
 * tên file ảnh. Dùng chung giữa DTO backend (`@Matches`) và Yup schema của màn quản trị.
 */
export const CATALOG_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,79}$/;

/**
 * Trạng thái thị trường của một MẪU XE trong danh mục.
 *
 * Danh sách hãng đưa ra cho chủ xe không thể chỉ có xe đang bán: phần lớn xe cho thuê ở Việt Nam
 * là xe đời trước, và một danh sách "chỉ xe đang phân phối" buộc chủ chiếc Innova 2018 phải chọn
 * "Khác" — tức là mất luôn dữ liệu chuẩn hoá mà danh mục sinh ra để có.
 *
 * Hai giá trị này KHÔNG phải bật/tắt: mẫu `legacy` vẫn chọn được, chỉ nằm ở nhóm thứ hai trong
 * danh sách. `active = false` mới là thứ ẩn một mẫu đi.
 */
export const CATALOG_MARKET_STATUS = {
  /** Hãng đang phân phối chính hãng tại Việt Nam. */
  CURRENT: 'current',
  /** Đã ngừng phân phối, nhưng còn chạy nhiều ngoài đường. */
  LEGACY: 'legacy',
} as const;

export type CatalogMarketStatus =
  (typeof CATALOG_MARKET_STATUS)[keyof typeof CATALOG_MARKET_STATUS];
export const CATALOG_MARKET_STATUS_VALUES = Object.values(
  CATALOG_MARKET_STATUS,
) as CatalogMarketStatus[];

export function isCatalogMarketStatus(value: unknown): value is CatalogMarketStatus {
  return typeof value === 'string' && (CATALOG_MARKET_STATUS_VALUES as string[]).includes(value);
}

export const CATALOG_MARKET_STATUS_LABEL: Readonly<Record<CatalogMarketStatus, string>> = {
  [CATALOG_MARKET_STATUS.CURRENT]: 'Đang phân phối',
  [CATALOG_MARKET_STATUS.LEGACY]: 'Mẫu xe đời trước',
};

/**
 * Bỏ dấu tiếng Việt và hạ chữ thường — dùng cho ô tìm kiếm trong danh mục hãng/mẫu xe.
 *
 * Người gõ "civic" phải ra "CIVIC", người gõ "kham pha" phải ra "Khám Phá". Không có bước này thì
 * mọi ô tìm kiếm tự cài một cách chuẩn hoá riêng, và cùng một từ khoá cho hai kết quả khác nhau ở
 * hai màn hình. Dùng được cả ở web, native lẫn backend — không phụ thuộc DB collation.
 */
export function normalizeCatalogSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

/**
 * Khoá `key` của một mẫu xe: `<hãng>-<mẫu>` viết thường, vì nó đi vào URL bộ lọc và phải ổn định
 * khi nhãn hiển thị đổi (ví dụ hãng viết hoa lại tên xe).
 */
export function catalogModelKey(brandKey: string, modelLabel: string): string {
  const slug = normalizeCatalogSearch(modelLabel)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${brandKey}-${slug}`;
}
