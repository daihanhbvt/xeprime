import type { components } from '@xeprime/types';

/** Shape từ contract OpenAPI (ADR 0007) — không viết tay lại DTO. */
type Schemas = components['schemas'];

/** Một LIÊN KẾT tài xế của bên thuê với một tài khoản khách (ADR 0063). */
export type Driver = Schemas['DriverDto'];
export type InviteDriverInput = Schemas['InviteDriverDto'];
export type UpdateDriverInput = Schemas['UpdateDriverDto'];
export type DriverLicenceSummary = Schemas['DriverLicenceSummaryDto'];
/** Tóm tắt tài xế gắn trên đơn thuê — kèm trạng thái lượt gán (chờ nhận / đã nhận). */
export type BookingDriverSummary = Schemas['BookingDriverSummaryDto'];
/** Tài xế trong bộ chọn gán đơn — `busy` = có chuyến khác giao khung giờ, ở BẤT KỲ bên thuê nào. */
export type AssignableDriver = Schemas['AssignableDriverDto'];
/** Tiền công/ngày mặc định của gian hàng + giới hạn nền tảng (ADR 0075). */
export type DriverWageSettings = Schemas['DriverWageSettingsDto'];
export type UpdateDriverWageSettingsInput = Schemas['UpdateDriverWageSettingsDto'];
/** Một chuyến tài xế đã nhận, kết thúc trong tháng — ngăn kéo tiền công theo tài xế. */
export type DriverAssignmentRow = Schemas['DriverAssignmentRowDto'];
/** Ngăn chi tiết một tài xế: hồ sơ + tiền công tháng + việc đang treo + độ tin cậy + xu hướng. */
export type DriverOverview = Schemas['DriverOverviewDto'];
/** Dải số đếm đầu màn Tài xế — đã áp bộ lọc chung. */
export type DriverSummary = Schemas['DriverSummaryDto'];
/** Một người trong DANH BẠ tài xế nội bộ (ADR 0108) — không tài khoản XePrime. */
export type InternalDriver = Schemas['InternalDriverDto'];
export type CreateInternalDriverInput = Schemas['CreateInternalDriverDto'];
export type UpdateInternalDriverInput = Schemas['UpdateInternalDriverDto'];
/** Tài xế nội bộ trong bộ chọn gán đơn — `busy` = đã gán một đơn khác giao khung giờ. */
export type AssignableInternalDriver = Schemas['AssignableInternalDriverDto'];

/** Hai danh sách của màn Tài xế — sống trên URL (`view`). */
export const DRIVERS_VIEW = {
  LINKED: 'linked',
  INTERNAL: 'internal',
} as const;
export type DriversView = (typeof DRIVERS_VIEW)[keyof typeof DRIVERS_VIEW];

export interface InternalDriverFilters {
  q?: string;
  /** true = danh sách đã lưu trữ. */
  archived?: boolean;
  page?: number;
  limit?: number;
}

/** Tab của ngăn chi tiết tài xế — sống trên URL cùng `open`. */
export const DRIVER_DETAIL_TAB = {
  OVERVIEW: 'overview',
  TRIPS: 'trips',
  PROFILE: 'profile',
} as const;
export type DriverDetailTab = (typeof DRIVER_DETAIL_TAB)[keyof typeof DRIVER_DETAIL_TAB];
export const DRIVER_DETAIL_TABS: readonly DriverDetailTab[] = Object.values(DRIVER_DETAIL_TAB);

export interface DriverFilters {
  q?: string;
  /**
   * Bỏ trống = các liên kết còn mở (mời · đang liên kết · tạm khoá) — mặc định của server;
   * `any` = mọi trạng thái; `closed` = đã từ chối + đã kết thúc.
   */
  linkStatus?: string;
  /** `needed` = chỉ liên kết cần đối chiếu bằng lái (`DRIVER_LICENCE_CHECK_FILTER`). */
  licenceCheck?: string;
  driverType?: string;
  /** `DRIVER_OPERATION_FILTER` — đang có chuyến / rảnh. */
  operation?: string;
  /** `DRIVER_LIST_SORT` — bỏ trống = mới nhất (mặc định của màn, khác mặc định server). */
  sort?: string;
  /** Tháng `YYYY-MM` (giờ VN) của hai cột thống kê tiền công — bỏ trống = tháng hiện tại. */
  month?: string;
  /** Tài xế đang mở ở ngăn chi tiết (id liên kết) — chỉ đổi giao diện, không lọc danh sách. */
  open?: string;
  tab?: DriverDetailTab;
  page?: number;
  limit?: number;
}
