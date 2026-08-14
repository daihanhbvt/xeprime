import type { PaginationMeta } from '@xeprime/types';
import { apiRequest, type QueryParams } from '@/services/api-client';
import type { CustomerTrip, CustomerTripCounts, CustomerTripDetail } from './types';

export const TRIPS_DEFAULT_LIMIT = 10;

export interface TripsResult {
  items: CustomerTrip[];
  meta: PaginationMeta;
  counts: CustomerTripCounts;
}

const EMPTY_COUNTS: CustomerTripCounts = {
  all: 0,
  pending: 0,
  upcoming: 0,
  active: 0,
  completed: 0,
  cancelled: 0,
};

export function tripsToParams(filter: string, page: number): QueryParams {
  return { filter, page, limit: TRIPS_DEFAULT_LIMIT };
}

/**
 * Envelope riêng của `GET /trips`: ngoài `data`/`meta` còn mang `counts` cho các tab. Số trên
 * tab và danh sách phải đến từ CÙNG một lần đọc — tách thành request thứ hai là mở đường cho
 * tab hiện `Đang thuê (1)` trong khi danh sách trống.
 */
interface TripsEnvelope {
  data: CustomerTrip[];
  meta?: PaginationMeta;
  counts?: CustomerTripCounts;
}

export async function fetchTrips(filter: string, page: number): Promise<TripsResult> {
  const res = (await apiRequest<CustomerTrip[]>('/trips', {
    query: tripsToParams(filter, page),
  })) as TripsEnvelope;

  return {
    items: res.data,
    meta: res.meta ?? {
      page: 1,
      limit: TRIPS_DEFAULT_LIMIT,
      total: res.data.length,
      hasNext: false,
    },
    counts: res.counts ?? EMPTY_COUNTS,
  };
}

export function fetchTrip(id: string): Promise<CustomerTripDetail> {
  return apiRequest<CustomerTripDetail>(`/trips/${id}`).then((res) => res.data);
}
