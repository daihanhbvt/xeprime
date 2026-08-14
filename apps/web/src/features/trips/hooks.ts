'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { fetchTrip, fetchTrips, tripsToParams } from './api';

/** Danh sách chuyến của khách. Lọc + phân trang ở server; `filter` sống trên URL (ADR 0004). */
export function useTrips(filter: string, page: number) {
  return useQuery({
    queryKey: queryKeys.trips.list(tripsToParams(filter, page)),
    queryFn: () => fetchTrips(filter, page),
    // Đổi tab không nháy sang trống rồi mới có dữ liệu.
    placeholderData: keepPreviousData,
  });
}

/** Một chuyến. `id` nhận cả id yêu cầu lẫn id đơn — thông báo trỏ vào cả hai loại. */
export function useTrip(id: string) {
  return useQuery({
    queryKey: queryKeys.trips.detail(id),
    queryFn: () => fetchTrip(id),
    enabled: Boolean(id),
  });
}
