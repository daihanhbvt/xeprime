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
};

/** Mô tả dưới tiêu đề tab ở màn quản trị danh mục — nói rõ mục này chạy ra đâu. */
export const CATALOG_TYPE_HINT: Readonly<Record<CatalogType, string>> = {
  [CATALOG_TYPE.VEHICLE_BRAND]: 'Hiện ở ô "Hãng xe" khi tạo/sửa xe và ở bộ lọc ngoài chợ.',
  [CATALOG_TYPE.BODY_TYPE]: 'Hiện thành thẻ có ảnh khi tạo/sửa xe và ở bộ lọc "Loại xe" ngoài chợ.',
  [CATALOG_TYPE.FUEL_TYPE]: 'Hiện ở ô "Nguồn năng lượng" khi tạo/sửa xe và ở bộ lọc ngoài chợ.',
  [CATALOG_TYPE.VEHICLE_FEATURE]: 'Hiện ở phần "Tiện ích" khi tạo/sửa xe và ở bộ lọc ngoài chợ.',
};

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
