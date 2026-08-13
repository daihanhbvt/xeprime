import type { PaginationMeta } from '@xeprime/types';
import { apiGet, apiPatch, apiPost, apiRequest, type QueryParams } from '@/services/api-client';
import type {
  BookingDetail,
  BookingFilters,
  BookingListItem,
  CheckConflictInput,
  CheckConflictResult,
  CreateBookingInput,
  TransitionInput,
  UpdateBookingInput,
  UpdateDeliveryFeeInput,
} from './types';

export const BOOKINGS_DEFAULT_LIMIT = 20;

export interface BookingListResult {
  items: BookingListItem[];
  meta: PaginationMeta;
}

/** Filter (URL) → query params gửi API. Bỏ giá trị rỗng để URL và cache key gọn. */
export function filtersToParams(filters: BookingFilters): QueryParams {
  return {
    q: filters.q ?? null,
    status: filters.status ?? null,
    vehicleId: filters.vehicleId ?? null,
    returnFrom: filters.returnFrom ?? null,
    returnTo: filters.returnTo ?? null,
    sort: filters.sort ?? null,
    page: filters.page ?? 1,
    limit: filters.limit ?? BOOKINGS_DEFAULT_LIMIT,
  };
}

export async function fetchBookings(filters: BookingFilters): Promise<BookingListResult> {
  const res = await apiRequest<BookingListItem[]>('/bookings', { query: filtersToParams(filters) });
  return {
    items: res.data,
    meta: (res.meta as PaginationMeta | undefined) ?? {
      page: 1,
      limit: BOOKINGS_DEFAULT_LIMIT,
      total: res.data.length,
      hasNext: false,
    },
  };
}

export const fetchBooking = (id: string): Promise<BookingDetail> =>
  apiGet<BookingDetail>(`/bookings/${id}`);

export const createBooking = (body: CreateBookingInput): Promise<BookingDetail> =>
  apiPost<BookingDetail>('/bookings', body);

export const updateBooking = (id: string, body: UpdateBookingInput): Promise<BookingDetail> =>
  apiPatch<BookingDetail>(`/bookings/${id}`, body);

export const transitionBooking = (id: string, body: TransitionInput): Promise<BookingDetail> =>
  apiPost<BookingDetail>(`/bookings/${id}/transition`, body);

/**
 * Chốt phí giao nhận sau khi chủ xe và khách đã thống nhất NGOÀI ứng dụng (Wave 9).
 *
 * Endpoint ngữ nghĩa riêng chứ không phải `PATCH /bookings/:id`: server tính lại tổng tiền và
 * ghi audit (ai đổi, từ bao nhiêu sang bao nhiêu). Khách KHÔNG phải xác nhận.
 */
export const updateBookingDeliveryFee = (
  id: string,
  body: UpdateDeliveryFeeInput,
): Promise<BookingDetail> => apiPatch<BookingDetail>(`/bookings/${id}/delivery-fee`, body);

/** Preview trùng lịch — chỉ để cảnh báo sớm cho UX, không phải lớp bảo vệ (ADR 0006). */
export const checkConflict = (body: CheckConflictInput): Promise<CheckConflictResult> =>
  apiPost<CheckConflictResult>('/calendar/check-conflict', body);
