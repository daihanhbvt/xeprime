import type { PaginationMeta } from '@xeprime/types';
import { startOfAppDay } from '@/lib/datetime';
import { apiGet, apiPost, apiRequest, type QueryParams } from '@/services/api-client';
import type {
  AdminBooking,
  AdminBookingDetail,
  AdminBookingFilters,
  BookingContact,
} from './types';

export const ADMIN_BOOKINGS_DEFAULT_LIMIT = 20;

export interface AdminBookingListResult {
  items: AdminBooking[];
  meta: PaginationMeta;
}

const pick = (v: string | undefined) => (v && v !== 'all' ? v : null);

export function filtersToParams(filters: AdminBookingFilters): QueryParams {
  return {
    q: filters.q ?? null,
    phone: filters.phone ?? null,
    tenantId: filters.tenantId ?? null,
    vehicleId: filters.vehicleId ?? null,
    status: pick(filters.status),
    dateField: pick(filters.dateField),
    // URL giữ `YYYY-MM-DD` (giờ VN) → API nhận mốc tuyệt đối: từ 00:00 ngày đầu đến hết ngày cuối.
    dateFrom: filters.dateFrom ? startOfAppDay(filters.dateFrom).toISOString() : null,
    dateTo: filters.dateTo
      ? startOfAppDay(filters.dateTo).add(1, 'day').subtract(1, 'millisecond').toISOString()
      : null,
    page: filters.page ?? 1,
    limit: filters.limit ?? ADMIN_BOOKINGS_DEFAULT_LIMIT,
  };
}

export async function fetchAdminBookings(
  filters: AdminBookingFilters,
): Promise<AdminBookingListResult> {
  const res = await apiRequest<AdminBooking[]>('/platform/bookings', {
    query: filtersToParams(filters),
  });
  return {
    items: res.data,
    meta: (res.meta as PaginationMeta | undefined) ?? {
      page: 1,
      limit: ADMIN_BOOKINGS_DEFAULT_LIMIT,
      total: res.data.length,
      hasNext: false,
    },
  };
}

export const fetchAdminBooking = (id: string): Promise<AdminBookingDetail> =>
  apiGet<AdminBookingDetail>(`/platform/bookings/${id}`);

/** Bỏ che SĐT khách. Mỗi lần gọi là một dòng audit ở backend — không gọi ngầm/tự động. */
export const revealBookingContact = (id: string): Promise<BookingContact> =>
  apiPost<BookingContact>(`/platform/bookings/${id}/contact`);
