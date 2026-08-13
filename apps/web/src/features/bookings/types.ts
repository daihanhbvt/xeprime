import type { components } from '@xeprime/types';

/**
 * Shape đơn thuê lấy thẳng từ contract sinh bởi OpenAPI (ADR 0007) — KHÔNG viết tay lại DTO.
 * Đổi DTO backend → chạy `pnpm contract` → các type này tự cập nhật.
 */
type Schemas = components['schemas'];

export type BookingListItem = Schemas['BookingListItemDto'];
export type BookingDetail = Schemas['BookingDetailDto'];
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
  vehicleId?: string;
  returnFrom?: string;
  returnTo?: string;
  sort?: BookingSort;
  page?: number;
  limit?: number;
}
