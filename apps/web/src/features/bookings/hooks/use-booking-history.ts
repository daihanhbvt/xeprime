'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { fetchBookingHistory, historyFiltersToParams } from '../api';
import type { BookingHistoryFilters } from '../types';

/** "Đơn đã kết thúc" — một trang, lọc/phân trang ở server. */
export function useBookingHistory(filters: BookingHistoryFilters) {
  const params = historyFiltersToParams(filters);
  return useQuery({
    queryKey: queryKeys.bookings.history(params),
    queryFn: () => fetchBookingHistory(filters),
    placeholderData: keepPreviousData,
  });
}
