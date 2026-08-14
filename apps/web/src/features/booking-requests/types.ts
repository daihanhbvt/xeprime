import type { components } from '@xeprime/types';

/** Shape yêu cầu đặt xe lấy từ contract OpenAPI (ADR 0007) — không viết tay lại DTO. */
type Schemas = components['schemas'];

export type BookingRequestItem = Schemas['BookingRequestDto'];
export type CreateBookingRequestInput = Schemas['CreateBookingRequestDto'];
export type BookingRequestReceipt = Schemas['BookingRequestReceiptDto'];
export type CheckAvailabilityInput = Schemas['CheckAvailabilityDto'];
export type CheckAvailabilityResult = Schemas['CheckAvailabilityResultDto'];

/** Filter inbox yêu cầu — ở URL searchParams (ADR 0004). */
export interface BookingRequestFilters {
  status?: string;
  vehicleId?: string;
  /** Chi nhánh của XE được yêu cầu — ghép từ bộ chọn ở thanh trên. */
  branchId?: string;
  page?: number;
  limit?: number;
}
