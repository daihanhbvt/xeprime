'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { fetchBookings, filtersToParams } from '../api';
import type { BookingFilters } from '../types';

/**
 * Danh sách đơn thuê — server data (TanStack Query, ADR 0004). Luôn phân trang server-side.
 * `keepPreviousData` giữ trang cũ trong lúc tải trang mới để bảng không nhấp nháy về rỗng.
 */
export function useBookings(filters: BookingFilters) {
  return useQuery({
    queryKey: queryKeys.bookings.list(filtersToParams(filters)),
    queryFn: () => fetchBookings(filters),
    placeholderData: keepPreviousData,
  });
}
