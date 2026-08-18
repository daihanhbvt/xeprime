import type { PaginationMeta } from '@xeprime/types';
import { apiPost, apiRequest, type QueryParams } from '@/services/api-client';
import type {
  ApproveBookingRequestInput,
  BookingRequestFilters,
  BookingRequestItem,
  BookingRequestReceipt,
  CheckAvailabilityInput,
  CheckAvailabilityResult,
  CreateBookingRequestInput,
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
    branchId: filters.branchId ?? null,
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

/**
 * Duyệt yêu cầu. Dịch vụ theo ngày không cần body; THUÊ DÀI HẠN bắt buộc `scheduledPickupAt`
 * (gian hàng chốt giờ nhận, server tính giờ trả theo gói — ADR 0011).
 */
export const approveBookingRequest = (
  id: string,
  body?: ApproveBookingRequestInput,
): Promise<BookingRequestItem> =>
  apiPost<BookingRequestItem>(`/booking-requests/${id}/approve`, body ?? {});

export const rejectBookingRequest = (id: string, reason?: string): Promise<BookingRequestItem> =>
  apiPost<BookingRequestItem>(`/booking-requests/${id}/reject`, { reason });

/** Công khai — khách gửi yêu cầu thuê từ marketplace (không cần đăng nhập). */
export const submitBookingRequest = (
  body: CreateBookingRequestInput,
): Promise<BookingRequestReceipt> =>
  apiPost<BookingRequestReceipt>('/public/booking-requests', body);

/** Công khai — kiểm tra nhanh khung giờ của một xe còn trống không (preview, ADR 0006). */
export const checkAvailability = (body: CheckAvailabilityInput): Promise<CheckAvailabilityResult> =>
  apiPost<CheckAvailabilityResult>('/public/booking-requests/check-availability', body);
