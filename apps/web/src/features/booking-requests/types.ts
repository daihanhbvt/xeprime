import type { components, PaginationMeta } from '@xeprime/types';

/** Shape yêu cầu đặt xe lấy từ contract OpenAPI (ADR 0007) — không viết tay lại DTO. */
type Schemas = components['schemas'];

export type BookingRequestItem = Schemas['BookingRequestDto'];
export type CreateBookingRequestInput = Schemas['CreateBookingRequestDto'];
/** Body duyệt — thuê dài hạn bắt buộc `scheduledPickupAt` (ADR 0011). */
export type ApproveBookingRequestInput = Schemas['ApproveBookingRequestDto'];
export type BookingRequestReceipt = Schemas['BookingRequestReceiptDto'];
export type CheckAvailabilityInput = Schemas['CheckAvailabilityDto'];
export type CheckAvailabilityResult = Schemas['CheckAvailabilityResultDto'];
/** Lịch bận của một xe để tô/khoá ô trên hộp chọn thời gian thuê (preview — ADR 0006). */
export type VehicleBusyDays = Schemas['VehicleBusyDaysDto'];
export type VehicleBusyDay = Schemas['VehicleBusyDayDto'];
export type VehicleBusyPeriod = Schemas['VehicleBusyPeriodDto'];
/** Hội thoại mở từ phía GIAN HÀNG cho một yêu cầu (`POST /booking-requests/:id/conversation`). */
export type BookingRequestConversation = Schemas['ConversationSummaryDto'];

/** Số yêu cầu của từng trạng thái — nuôi con số trên các tab, do backend gộp. */
export type BookingRequestStatusCount = Schemas['BookingRequestStatusCountDto'];

/**
 * `meta` của danh sách: phân trang + đếm theo trạng thái.
 *
 * Đếm KHÔNG suy từ trang hiện tại (xem DTO backend) — trang chỉ có tối đa `limit` bản ghi nên
 * mọi phép cộng ở client đều sai kể từ bản ghi thứ 21.
 */
export interface BookingRequestListMeta extends PaginationMeta {
  statusCounts: BookingRequestStatusCount[];
}

/** Filter inbox yêu cầu — ở URL searchParams (ADR 0004). */
export interface BookingRequestFilters {
  /**
   * Trạng thái đang lọc. `all` là một GIÁ TRỊ THẬT chứ không phải "không lọc": bỏ tham số đi
   * thì hook lại rơi về mặc định `pending_host_approval`, nên "Tất cả" sẽ không bao giờ giữ
   * được. Nó chỉ được dịch thành "không gửi `status`" ở lớp gọi API.
   */
  status?: string;
  /** Tìm theo tên khách / SĐT / tên xe / biển số — lọc ở SERVER, không cắt trên trang đang mở. */
  q?: string;
  /** Dịch vụ khách yêu cầu (tự lái / có tài xế / dài hạn) — mã thật của `@xeprime/types`. */
  serviceType?: string;
  vehicleId?: string;
  /** Chi nhánh của XE được yêu cầu — ghép từ bộ chọn ở thanh trên. */
  branchId?: string;
  page?: number;
  limit?: number;
}
