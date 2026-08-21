import { DEFAULT_PAGE_SIZE, pickFilter } from '@/constants/filters';
import { startOfAppDay } from '@/lib/datetime';
import {
  apiGet,
  apiPost,
  fetchPage,
  type Paged,
  type QueryParams,
} from '@/services/api-client';
import type {
  AdminBooking,
  AdminBookingDetail,
  AdminBookingFilters,
  BookingContact,
} from './types';

export const ADMIN_BOOKINGS_DEFAULT_LIMIT = DEFAULT_PAGE_SIZE;

export type AdminBookingListResult = Paged<AdminBooking>;

export function filtersToParams(filters: AdminBookingFilters): QueryParams {
  return {
    q: filters.q ?? null,
    phone: filters.phone ?? null,
    tenantId: filters.tenantId ?? null,
    vehicleId: filters.vehicleId ?? null,
    status: pickFilter(filters.status),
    dateField: pickFilter(filters.dateField),
    // URL giữ `YYYY-MM-DD` (giờ VN) → API nhận mốc tuyệt đối: từ 00:00 ngày đầu đến hết ngày cuối.
    dateFrom: filters.dateFrom ? startOfAppDay(filters.dateFrom).toISOString() : null,
    dateTo: filters.dateTo
      ? startOfAppDay(filters.dateTo).add(1, 'day').subtract(1, 'millisecond').toISOString()
      : null,
    page: filters.page ?? 1,
    limit: filters.limit ?? ADMIN_BOOKINGS_DEFAULT_LIMIT,
  };
}

export const fetchAdminBookings = (
  filters: AdminBookingFilters,
): Promise<AdminBookingListResult> =>
  fetchPage<AdminBooking>(
    '/platform/bookings',
    filtersToParams(filters),
    ADMIN_BOOKINGS_DEFAULT_LIMIT,
  );

export const fetchAdminBooking = (id: string): Promise<AdminBookingDetail> =>
  apiGet<AdminBookingDetail>(`/platform/bookings/${id}`);

/** Bỏ che SĐT khách. Mỗi lần gọi là một dòng audit ở backend — không gọi ngầm/tự động. */
export const revealBookingContact = (id: string): Promise<BookingContact> =>
  apiPost<BookingContact>(`/platform/bookings/${id}/contact`);
