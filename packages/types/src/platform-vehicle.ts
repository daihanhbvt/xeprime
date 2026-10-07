/**
 * Xe TOÀN HỆ THỐNG nhìn từ khu Platform Admin (`/platform/vehicles`) — hai bộ mã đi trên dây mà
 * API (validate + đếm) và web (ô chọn + lối tắt) phải cùng đọc một chỗ (ADR 0005).
 */

/** Sắp xếp danh sách xe toàn hệ thống — server-side, trước phân trang. */
export const PLATFORM_VEHICLE_SORT = {
  NEWEST: 'newest',
  UPDATED: 'updated',
  NAME: 'name',
  PRICE_DESC: 'price_desc',
  PRICE_ASC: 'price_asc',
} as const;

export type PlatformVehicleSort =
  (typeof PLATFORM_VEHICLE_SORT)[keyof typeof PLATFORM_VEHICLE_SORT];

export const PLATFORM_VEHICLE_SORT_VALUES = Object.values(
  PLATFORM_VEHICLE_SORT,
) as PlatformVehicleSort[];

export const DEFAULT_PLATFORM_VEHICLE_SORT: PlatformVehicleSort = PLATFORM_VEHICLE_SORT.NEWEST;

export function isPlatformVehicleSort(value: unknown): value is PlatformVehicleSort {
  return (PLATFORM_VEHICLE_SORT_VALUES as unknown[]).includes(value);
}

/**
 * GÓC NHÌN nhanh của màn giám sát xe — mỗi góc nhìn là một tổ hợp cố định của ba chiều lọc
 * (`publicStatus` · `tenantStatus` · `marketplaceVisible`), và server trả SỐ ĐẾM của từng góc
 * nhìn trong cùng lần đọc danh sách (`counts`), tính trong phạm vi các bộ lọc còn lại.
 *
 * Là mã đi trên dây (khoá của `counts`), không phải nhãn: web dựng patch bộ lọc và nhãn từ đây.
 * `all` không phải một chiều lọc — nó là "không lọc theo góc nhìn nào".
 */
export const PLATFORM_VEHICLE_VIEW = {
  ALL: 'all',
  /** Khách THẬT SỰ thấy ngoài chợ — bốn vế của `marketplaceVehicleWhere()` (ADR 0048). */
  VISIBLE: 'visible',
  /** Đang chờ nền tảng duyệt lên chợ. */
  PENDING_REVIEW: 'pending_review',
  /** Nền tảng đã ẩn vì vi phạm. */
  PLATFORM_HIDDEN: 'platform_hidden',
  /** Thuộc gian hàng đang bị khoá. */
  SUSPENDED_SHOP: 'suspended_shop',
} as const;

export type PlatformVehicleView =
  (typeof PLATFORM_VEHICLE_VIEW)[keyof typeof PLATFORM_VEHICLE_VIEW];

export const PLATFORM_VEHICLE_VIEW_VALUES = Object.values(
  PLATFORM_VEHICLE_VIEW,
) as PlatformVehicleView[];

export function isPlatformVehicleView(value: unknown): value is PlatformVehicleView {
  return (PLATFORM_VEHICLE_VIEW_VALUES as unknown[]).includes(value);
}

/** Số xe của từng góc nhìn — cùng phạm vi lọc với bảng (UX §1.1 điều 2). */
export type PlatformVehicleCounts = Readonly<Record<PlatformVehicleView, number>>;
