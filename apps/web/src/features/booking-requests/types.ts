import type { components, PaginationMeta } from '@xeprime/types';

/** Shape yêu cầu đặt xe lấy từ contract OpenAPI (ADR 0007) — không viết tay lại DTO. */
type Schemas = components['schemas'];

export type BookingRequestItem = Schemas['BookingRequestDto'];

/**
 * Bộ trường TỐI THIỂU mà bốn hộp thoại quyết định (duyệt · duyệt dài hạn · từ chối · báo kết
 * quả) thật sự đọc.
 *
 * Tồn tại vì màn "Chuyến của tôi" cũng duyệt/từ chối được, nhưng nó đọc chuyến từ `/trips` —
 * một DTO khác, cố ý hẹp hơn (không có ghi chú nội bộ, không có hồ sơ khách của gian hàng).
 * Bắt nó dựng một `BookingRequestItem` đầy đủ nghĩa là bịa ra những trường nó không có.
 *
 * `Pick` chứ không phải một interface viết tay: kiểu của từng trường lấy NGUYÊN từ contract,
 * nên `BookingRequestItem` luôn thoả (hộp thư gian hàng không đổi một dòng), và một lần đổi
 * contract không thể để hai bên hiểu khác nhau về cùng một trường.
 */
export type BookingRequestDecisionTarget = Omit<
  Pick<
    BookingRequestItem,
    | 'id'
    | 'bookingId'
    | 'vehicleId'
    | 'vehicleName'
    | 'vehiclePlate'
    | 'customerName'
    | 'customerPhone'
    | 'serviceType'
    | 'pickupAt'
    | 'returnAt'
    | 'deliveryRequested'
    | 'longTermPackageMonths'
    | 'pickupPreference'
    | 'requestedPickupDate'
    | 'pickupWindowStartDate'
    | 'pickupWindowEndDate'
  >,
  'customerPhone' | 'serviceType' | 'pickupPreference'
> & {
  /**
   * `null` khi chưa được phép liên hệ — chuyến tuyến hoa hồng còn đang chờ duyệt (ADR 0028
   * điều 9). Hộp thư gian hàng luôn có số thật nên vẫn thoả kiểu này.
   */
  readonly customerPhone: string | null;
  /** Mã dịch vụ đi trên dây; `/trips` khai `string` còn hộp thư khai union — `string` nhận cả hai. */
  readonly serviceType: string;
  readonly pickupPreference?: string | null;
};
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
