import type { components } from '@xeprime/types';

/** Shape yêu cầu đặt xe lấy từ contract OpenAPI (ADR 0007) — không viết tay lại DTO. */
type Schemas = components['schemas'];

export type BookingRequestItem = Schemas['BookingRequestDto'];
export type CreateBookingRequestInput = Schemas['CreateBookingRequestDto'];
export type BookingRequestReceipt = Schemas['BookingRequestReceiptDto'];
export type CheckAvailabilityInput = Schemas['CheckAvailabilityDto'];
export type CheckAvailabilityResult = Schemas['CheckAvailabilityResultDto'];
export type SaveDeliveryQuoteInput = Schemas['SaveDeliveryQuoteDto'];
export type DeliveryQuotePreview = Schemas['DeliveryQuotePreviewDto'];

/** Filter inbox yêu cầu — ở URL searchParams (ADR 0004). */
export interface BookingRequestFilters {
  status?: string;
  vehicleId?: string;
  page?: number;
  limit?: number;
}
