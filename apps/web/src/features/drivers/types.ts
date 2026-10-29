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

export interface DriverFilters {
  q?: string;
  /** Bỏ trống = các liên kết còn mở (mời · đang liên kết · tạm khoá) — mặc định của server. */
  linkStatus?: string;
  driverType?: string;
  /** Tháng `YYYY-MM` (giờ VN) của hai cột thống kê tiền công — bỏ trống = tháng hiện tại. */
  month?: string;
  page?: number;
  limit?: number;
}
