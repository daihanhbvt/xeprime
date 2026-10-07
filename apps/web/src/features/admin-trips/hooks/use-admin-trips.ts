'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import {
  fetchTripBookings,
  fetchTripRequests,
  fetchTripSummary,
  queueParams,
  remindTripRequest,
  summaryParams,
} from '../api';
import { TRIP_REFRESH_INTERVAL_MS } from '../trip-queues';
import type { TripBookingFilters, TripRequestFilters } from '../types';

/** Dải tóm tắt — tự làm mới theo nhịp vận hành, kể cả khi tab đang mở nhưng không ai chạm. */
export function useTripSummary(opts: { tenantId?: string; enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.platformTrips.summary(summaryParams(opts.tenantId)),
    queryFn: () => fetchTripSummary(opts.tenantId),
    enabled: opts.enabled ?? true,
    refetchInterval: TRIP_REFRESH_INTERVAL_MS,
  });
}

export function useTripRequests(filters: TripRequestFilters) {
  return useQuery({
    queryKey: queryKeys.platformTrips.requests(queueParams(filters)),
    queryFn: () => fetchTripRequests(filters),
    placeholderData: keepPreviousData,
    refetchInterval: TRIP_REFRESH_INTERVAL_MS,
  });
}

export function useTripBookings(filters: TripBookingFilters) {
  return useQuery({
    queryKey: queryKeys.platformTrips.bookings(queueParams(filters)),
    queryFn: () => fetchTripBookings(filters),
    placeholderData: keepPreviousData,
    refetchInterval: TRIP_REFRESH_INTERVAL_MS,
  });
}

/**
 * Nhắc tay chủ xe. ID đi trong BIẾN của lượt gọi: hai dòng có thể được nhắc gần như cùng lúc,
 * và nút nào đang quay phải là nút của đúng yêu cầu đó (`variables.id`).
 *
 * Xong thì nạp lại hàng đợi (để "đã nhắc lúc" hiện ra từ audit) — không chạm dải tóm tắt, vì
 * nhắc không đổi số đếm.
 */
export function useRemindTripRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) => remindTripRequest(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.platformTrips.all,
        predicate: (query) => query.queryKey[1] === 'requests',
      });
    },
  });
}
