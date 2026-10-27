import type { components, PaginationMeta, PickupPreference } from '@xeprime/types';
import type { Dayjs } from 'dayjs';
import type { RentalMode } from '@/components/form/RentalDateTimeRangeField';
import type { PickupMethod } from './schema';

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
    | 'customerAccountPhone'
    | 'serviceType'
    | 'pickupAt'
    | 'returnAt'
    | 'deliveryRequested'
    | 'longTermPackageMonths'
    | 'pickupPreference'
    | 'requestedPickupDate'
    | 'pickupWindowStartDate'
    | 'pickupWindowEndDate'
    | 'pricing'
    | 'approvalPreview'
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

/**
 * Thứ khách ĐÃ chọn ở thẻ đặt xe của trang chi tiết — TOÀN BỘ chuyến. Hộp yêu cầu thuê không còn
 * bước "Chuyến đi" (27/10/2026): nó mở thẳng ở màn Xem lại từ đúng những giá trị này, nên thẻ đặt
 * xe chỉ mở hộp khi chuyến đã đủ (`ListingBookingCard`).
 *
 * Bản nháp chờ đăng nhập (ADR 0060) vẫn thắng nó, và mã khuyến mãi vẫn được server đánh giá lại cho
 * đúng người (ADR 0046 điều 7). Muốn đổi chuyến thì khách đóng hộp và chọn lại ở thẻ.
 */
export interface RequestBookingPrefill {
  /** Cách nhận xe khách chọn ở thẻ (tự lái / dài hạn). Có tài xế thì xe đến đón — bỏ qua. */
  pickupMethod?: PickupMethod;
  /**
   * Địa chỉ khách đã xác nhận ở thẻ (gợi ý bản đồ hoặc gõ tay): địa chỉ GIAO XE của chuyến tự lái /
   * dài hạn, hoặc điểm ĐÓN của chuyến có tài xế.
   */
  delivery?: {
    addressLine: string;
    provinceCode?: string | null;
    placeId?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  } | null;
  /** Điểm đến của chuyến có tài xế liên tỉnh — chuỗi tự do. */
  destination?: string | null;
  /** Thuê theo ngày hay theo giờ — đổi cách kể thời lượng ở thẻ chuyến. */
  rentalMode?: RentalMode;
  /** Gói thuê dài hạn đang chọn — ngoài sáu gói của ADR 0011 thì bỏ qua. */
  packageMonths?: number | null;
  /** Nguyện vọng ngày nhận của thuê dài hạn — kèm ngày cụ thể khi chọn `specific_date`. */
  pickupPreference?: PickupPreference;
  requestedPickupDate?: Dayjs | null;
  /** Mã khuyến mãi đang áp ở thẻ đặt xe — chuỗi mã, KHÔNG phải số giảm. */
  promoCode?: string | null;
  /** Khách chọn bảo hiểm vật chất xe MIC (IV) — tùy chọn. */
  vehicleProtectionSelected?: boolean;
  /** Khách chọn bảo hiểm tai nạn người ngồi trên xe MIC (IP) — tùy chọn. */
  personalAccidentSelected?: boolean;
}
/** Body duyệt — thuê dài hạn bắt buộc `scheduledPickupAt` (ADR 0011). */
export type ApproveBookingRequestInput = Schemas['ApproveBookingRequestDto'];
/** Body huỷ chuyến đã nhận — nhóm lý do BẮT BUỘC, chữ tự do bắt buộc khi chọn "Lý do khác". */
export type CancelBookingRequestInput = Schemas['CancelBookingRequestDto'];
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
  /** Chi nhánh của XE được yêu cầu — ô "Chi nhánh" của trang, sống trên URL (ADR 0052). */
  branchId?: string;
  page?: number;
  limit?: number;
}
