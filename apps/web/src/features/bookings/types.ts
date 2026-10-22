import type { BookingListPreset, components } from '@xeprime/types';

/**
 * Shape đơn thuê lấy thẳng từ contract sinh bởi OpenAPI (ADR 0007) — KHÔNG viết tay lại DTO.
 * Đổi DTO backend → chạy `pnpm contract` → các type này tự cập nhật.
 */
type Schemas = components['schemas'];

export type BookingListItem = Schemas['BookingListItemDto'];
export type BookingDetail = Schemas['BookingDetailDto'];
export type BookingDriverHistoryItem = Schemas['BookingDriverHistoryItemDto'];
export type BookingDriverSummary = Schemas['BookingDriverSummaryDto'];
export type ExternalDriverInput = Schemas['ExternalDriverInputDto'];
/**
 * Body của `PATCH /bookings/:id/driver` — ĐÚNG MỘT khoá (server từ chối body mang cả hai). DTO sinh
 * ra để cả hai khoá tuỳ chọn; union ở đây để TypeScript bắt lỗi trước khi server phải bắt.
 */
export type AssignBookingDriverInput =
  { driverId: string | null } | { externalDriver: ExternalDriverInput };
export type CreateBookingInput = Schemas['CreateBookingDto'];
export type UpdateBookingInput = Schemas['UpdateBookingDto'];
export type TransitionInput = Schemas['TransitionBookingDto'];
export type UpdateDeliveryFeeInput = Schemas['UpdateBookingDeliveryFeeDto'];
export type CheckConflictInput = Schemas['CheckConflictDto'];
export type CheckConflictResult = Schemas['CheckConflictResultDto'];

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
   * Nhóm việc dựng sẵn — do ROUTE quyết, không nằm trong searchParams.
   *
   * Cố ý không đi qua `useBookingFilters`: "đang xem nhóm nào" đã được đường dẫn nói rồi, và
   * để nó sống ở hai chỗ là mở đường cho một URL tự mâu thuẫn với chính nó.
   */
  preset?: BookingListPreset;
  vehicleId?: string;
  /** Loại dịch vụ của ĐƠN — ô "Loại dịch vụ" của hai bảng đơn, sống trên URL. */
  serviceType?: string;
  /** Chi nhánh của XE trong đơn — ô "Chi nhánh" của trang, sống trên URL (ADR 0052). */
  branchId?: string;
  returnFrom?: string;
  returnTo?: string;
  sort?: BookingSort;
  page?: number;
  limit?: number;
}
