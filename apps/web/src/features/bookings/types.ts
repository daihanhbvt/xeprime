import type {
  BookingHistoryOutcome,
  BookingHistoryTab,
  BookingListPreset,
  components,
} from '@xeprime/types';

/**
 * Shape đơn thuê lấy thẳng từ contract sinh bởi OpenAPI (ADR 0007) — KHÔNG viết tay lại DTO.
 * Đổi DTO backend → chạy `pnpm contract` → các type này tự cập nhật.
 */
type Schemas = components['schemas'];

export type BookingListItem = Schemas['BookingListItemDto'];
/** Meta của trang danh sách đơn — thêm số đếm bốn ngăn của cột trái. */
export type BookingListMeta = Schemas['BookingPageMetaDto'];
export type BookingDetail = Schemas['BookingDetailDto'];
/** Một món tài sản thế chấp khách để lại cho đơn (ADR 0109). */
export type BookingCollateral = Schemas['BookingCollateralDto'];
export type BookingCollateralInput = Schemas['BookingCollateralInputDto'];
/** Phụ lục gia hạn đơn dài hạn (ADR 0077) — bề mặt đối tác, có dòng phía chủ xe. */
export type BookingExtension = Schemas['BookingExtensionDto'];
export type BookingExtensionQuote = Schemas['BookingExtensionQuoteDto'];
/** Trường chung của thẻ danh sách và trang chi tiết mà hộp thoại gia hạn cần. */
export type ExtendableBooking = Pick<
  BookingListItem,
  | 'id'
  | 'code'
  | 'vehicleName'
  | 'vehiclePlate'
  | 'vehicleImageUrl'
  | 'pickupAt'
  | 'returnAt'
  | 'actualPickupAt'
  | 'totalAmount'
  | 'debtAmount'
>;
export type BookingDriverHistoryItem = Schemas['BookingDriverHistoryItemDto'];
export type BookingDriverSummary = Schemas['BookingDriverSummaryDto'];
export type BookingDriverIncident = Schemas['BookingDriverIncidentDto'];
/**
 * Body của `PATCH /bookings/:id/driver` — chỉ tài xế LIÊN KẾT (`null` = bỏ gán). Khoá
 * `externalDriver` đã bỏ (ADR 0074 điều 4 — server trả 422), nên web không còn dựng được nó.
 */
/** Gán/bỏ gán tài xế — `wageAmount` (VND chuỗi) bỏ trống = mức mặc định × số ngày (ADR 0075). */
/** Gán tài xế LIÊN KẾT (kèm tiền công) / bỏ gán (`driverId: null`), hoặc gán tài xế NỘI BỘ (ADR 0108). */
export type AssignBookingDriverInput =
  { driverId: string | null; wageAmount?: string } | { internalDriverId: string };
/** Tiền công của một lượt gán (ADR 0075) — XePrime chỉ ghi nhận, chủ xe trả trực tiếp. */
export type DriverWage = Schemas['DriverWageDto'];
/** Số liệu cho hộp gán: số ngày, gợi ý mặc định × N, khoảng hợp lệ — server tính. */
export type DriverWageQuote = Schemas['DriverWageQuoteDto'];
export type UpdateDriverWageInput = Schemas['UpdateDriverWageDto'];
export type CreateBookingInput = Schemas['CreateBookingDto'];
/** Đổi nguồn của một đơn tự lập (ADR 0110). */
export type UpdateBookingSourceInput = Schemas['UpdateBookingSourceDto'];
export type UpdateBookingInput = Schemas['UpdateBookingDto'];
export type TransitionInput = Schemas['TransitionBookingDto'];
export type UpdateDeliveryFeeInput = Schemas['UpdateBookingDeliveryFeeDto'];
/** Khối "Chuẩn bị bàn giao" — việc suy tự động + dấu tay (03/11/2026). */
export type BookingHandoverPrep = Schemas['BookingHandoverPrepDto'];
export type SetHandoverPrepCheckInput = Schemas['SetHandoverPrepCheckDto'];
export type CheckConflictInput = Schemas['CheckConflictDto'];
export type CheckConflictResult = Schemas['CheckConflictResultDto'];

/** Một dòng "Đơn đã kết thúc" — đơn đã đóng HOẶC yêu cầu không thành đơn (`kind`). */
export type BookingHistoryItem = Schemas['BookingHistoryItemDto'];
export type BookingHistoryMeta = Schemas['BookingHistoryMetaDto'];

/** Bộ lọc màn "Đơn đã kết thúc" — sống ở URL (ADR 0004). */
export interface BookingHistoryFilters {
  tab?: BookingHistoryTab;
  outcome?: BookingHistoryOutcome;
  q?: string;
  serviceType?: string;
  branchId?: string;
  /** Nguồn đơn (ADR 0110) — mã nguồn hoặc `direct` (mọi đơn ngoài sàn). */
  source?: string;
  page?: number;
  limit?: number;
}

/** Khớp `BOOKING_SORT` ở backend DTO. */
export type BookingSort = 'newest' | 'pickup_asc' | 'pickup_desc' | 'return_asc';

/**
 * Filter danh sách đơn — sống ở URL searchParams (ADR 0004): chia sẻ link được, F5 không mất.
 * `returnFrom`/`returnTo` lọc theo ngày trả (dùng cho panel quá hạn/sắp trả ở dashboard).
 */
export interface BookingFilters {
  q?: string;
  status?: string;
  /**
   * Ngăn của cột trái "Quản lý đơn thuê xe" (02/11/2026) — sống ở URL `?preset=` (cùng tên với
   * tham số API), vắng = "Tất cả". Thay cho route riêng `/bookings/awaiting-pickup` (giờ chỉ
   * chuyển tiếp) và cho ô lọc "Trạng thái" đã bỏ.
   */
  preset?: BookingListPreset;
  vehicleId?: string;
  /** Loại dịch vụ của ĐƠN — ô "Loại dịch vụ" của hai bảng đơn, sống trên URL. */
  serviceType?: string;
  /** Chi nhánh của XE trong đơn — ô "Chi nhánh" của trang, sống trên URL (ADR 0052). */
  branchId?: string;
  /** Nguồn đơn (ADR 0110) — mã nguồn hoặc `direct` (mọi đơn ngoài sàn). */
  source?: string;
  /** Nhãn nguồn tự nhập, khớp đúng chuỗi — lọc một nền tảng / nguồn cụ thể. */
  sourceLabel?: string;
  returnFrom?: string;
  returnTo?: string;
  sort?: BookingSort;
  page?: number;
  limit?: number;
}
