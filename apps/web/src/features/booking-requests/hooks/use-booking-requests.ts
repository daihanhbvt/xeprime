'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { fetchBookingRequests, filtersToParams } from '../api';
import type { BookingRequestFilters } from '../types';

/** Inbox yêu cầu đặt xe — server data (TanStack Query), phân trang server-side. */
export function useBookingRequests(filters: BookingRequestFilters) {
  return useQuery({
    queryKey: queryKeys.bookingRequests.list(filtersToParams(filters)),
    queryFn: () => fetchBookingRequests(filters),
    placeholderData: keepPreviousData,
  });
}
