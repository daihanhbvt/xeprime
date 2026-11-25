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
/** Một chuyến tài xế đã nhận, kết thúc trong tháng — bảng "Chuyến & tiền công". */
export type DriverAssignmentRow = Schemas['DriverAssignmentRowDto'];
/** Trang chi tiết một tài xế: hồ sơ + tiền công tháng + việc đang treo + độ tin cậy + xu hướng. */
export type DriverOverview = Schemas['DriverOverviewDto'];
/** Một đơn đang gán (chiếm lịch) của tài xế — "Chuyến sắp tới". */
export type DriverCurrentTrip = Schemas['DriverCurrentTripDto'];
/** Một người trong DANH BẠ tài xế nội bộ (ADR 0108) — không tài khoản XePrime. */
export type InternalDriver = Schemas['InternalDriverDto'];
export type CreateInternalDriverInput = Schemas['CreateInternalDriverDto'];
export type UpdateInternalDriverInput = Schemas['UpdateInternalDriverDto'];
/** Tài xế nội bộ trong bộ chọn gán đơn — `busy` = đã gán một đơn khác giao khung giờ. */
export type AssignableInternalDriver = Schemas['AssignableInternalDriverDto'];
/** Trang chi tiết một tài xế nội bộ: hồ sơ + đơn đang gán. */
export type InternalDriverOverview = Schemas['InternalDriverOverviewDto'];
export type InternalDriverTripRow = Schemas['InternalDriverTripRowDto'];
/** Một dòng của danh sách GỘP (liên kết + nội bộ) — đúng một trong hai bên có giá trị. */
export type DriverRosterItem = Schemas['DriverRosterItemDto'];
/** Dải số đếm của danh sách gộp. */
export type DriverRosterSummary = Schemas['DriverRosterSummaryDto'];
/** Kết quả tra tài khoản theo SĐT ở hộp "Mời tài xế". */
export type DriverAccountLookup = Schemas['DriverAccountLookupDto'];

/** Tab của trang chi tiết tài xế liên kết — sống trên URL (`tab`). */
export const DRIVER_DETAIL_TAB = {
  OVERVIEW: 'overview',
  TRIPS: 'trips',
} as const;
export type DriverDetailTab = (typeof DRIVER_DETAIL_TAB)[keyof typeof DRIVER_DETAIL_TAB];
export const DRIVER_DETAIL_TABS: readonly DriverDetailTab[] = Object.values(DRIVER_DETAIL_TAB);

export interface DriverFilters {
  q?: string;
  /**
   * Bỏ trống = liên kết còn mở (mời · đang liên kết · tạm khoá) + tài xế nội bộ đang dùng;
   * `any` = mọi trạng thái; `closed` = liên kết đã từ chối/kết thúc + nội bộ đã lưu trữ.
   */
  linkStatus?: string;
  /** `needed` = chỉ liên kết cần đối chiếu bằng lái (`DRIVER_LICENCE_CHECK_FILTER`). */
  licenceCheck?: string;
  /** Hình thức hợp tác, hoặc `internal` = chỉ tài xế nội bộ (`DRIVER_TYPE_FILTER_INTERNAL`). */
  driverType?: string;
  /** `DRIVER_OPERATION_FILTER` — đang có chuyến / rảnh. */
  operation?: string;
  /** `DRIVER_LIST_SORT` — bỏ trống = mới nhất (mặc định của màn, khác mặc định server). */
  sort?: string;
  /** Tháng `YYYY-MM` (giờ VN) của dòng tiền công trên thẻ — bỏ trống = tháng hiện tại. */
  month?: string;
  page?: number;
  limit?: number;
}

/** Bảng chuyến của trang chi tiết tài xế — tìm, lọc, trang; sống trên URL. */
export interface DriverTripFilters {
  /** `YYYY-MM` (giờ VN) — bỏ trống = tháng hiện tại. */
  month?: string;
  q?: string;
  /** Liên kết: kết cục lượt gán (`DRIVER_ASSIGNMENT_OUTCOME`); nội bộ: trạng thái đơn. */
  status?: string;
  page?: number;
  limit?: number;
}
