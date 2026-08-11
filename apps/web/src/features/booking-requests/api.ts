import type { PaginationMeta } from '@xeprime/types';
import { apiPost, apiRequest, type QueryParams } from '@/services/api-client';
import type {
  BookingRequestFilters,
  BookingRequestItem,
  BookingRequestReceipt,
  CheckAvailabilityInput,
  CheckAvailabilityResult,
  CreateBookingRequestInput,
  DeliveryQuotePreview,
  SaveDeliveryQuoteInput,
} from './types';

export const BOOKING_REQUESTS_DEFAULT_LIMIT = 20;

export interface BookingRequestListResult {
  items: BookingRequestItem[];
  meta: PaginationMeta;
}

export function filtersToParams(filters: BookingRequestFilters): QueryParams {
  return {
    status: filters.status ?? null,
    vehicleId: filters.vehicleId ?? null,
    page: filters.page ?? 1,
    limit: filters.limit ?? BOOKING_REQUESTS_DEFAULT_LIMIT,
  };
}

export async function fetchBookingRequests(
  filters: BookingRequestFilters,
): Promise<BookingRequestListResult> {
  const res = await apiRequest<BookingRequestItem[]>('/booking-requests', {
    query: filtersToParams(filters),
  });
  return {
    items: res.data,
    meta: (res.meta as PaginationMeta | undefined) ?? {
      page: 1,
      limit: BOOKING_REQUESTS_DEFAULT_LIMIT,
      total: res.data.length,
      hasNext: false,
    },
  };
}

export const approveBookingRequest = (id: string): Promise<BookingRequestItem> =>
  apiPost<BookingRequestItem>(`/booking-requests/${id}/approve`);

export const rejectBookingRequest = (id: string, reason?: string): Promise<BookingRequestItem> =>
  apiPost<BookingRequestItem>(`/booking-requests/${id}/reject`, { reason });

/** Preview báo giá giao nhận — PricingService tính, KHÔNG lưu (drawer gọi khi shop nhập). */
export const previewDeliveryQuote = (
  id: string,
  body: SaveDeliveryQuoteInput,
): Promise<DeliveryQuotePreview> =>
  apiPost<DeliveryQuotePreview>(`/booking-requests/${id}/delivery-quote/preview`, body);

/** Chốt báo giá giao nhận cho yêu cầu — điều kiện để duyệt được yêu cầu có giao tận nơi. */
export const saveDeliveryQuote = (
  id: string,
  body: SaveDeliveryQuoteInput,
): Promise<BookingRequestItem> =>
  apiPost<BookingRequestItem>(`/booking-requests/${id}/delivery-quote`, body);

/** Công khai — khách gửi yêu cầu thuê từ marketplace (không cần đăng nhập). */
export const submitBookingRequest = (
  body: CreateBookingRequestInput,
): Promise<BookingRequestReceipt> =>
  apiPost<BookingRequestReceipt>('/public/booking-requests', body);

/** Công khai — kiểm tra nhanh khung giờ của một xe còn trống không (preview, ADR 0006). */
export const checkAvailability = (body: CheckAvailabilityInput): Promise<CheckAvailabilityResult> =>
  apiPost<CheckAvailabilityResult>('/public/booking-requests/check-availability', body);
