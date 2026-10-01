'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { fetchBookingRequests, filtersToParams } from '../api';
import type { BookingRequestFilters } from '../types';

/**
 * Inbox yêu cầu đặt xe — server data (TanStack Query), phân trang server-side.
 *
 * Chi nhánh lọc qua quan hệ XE được yêu cầu; backend áp nó cho CẢ `meta.statusCounts`, nên con
 * số trên hàng tab và danh sách bên dưới luôn nói cùng một phạm vi.
 */
export function useBookingRequests(filters: BookingRequestFilters) {
  const params = filtersToParams(filters);
  return useQuery({
    queryKey: queryKeys.bookingRequests.list(params),
    queryFn: () => fetchBookingRequests(filters),
    placeholderData: keepPreviousData,
  });
}
