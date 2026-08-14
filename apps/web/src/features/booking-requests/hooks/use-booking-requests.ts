'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useBranchScopeParams } from '@/features/branches/hooks/use-branch-scope';
import { queryKeys } from '@/services/query-keys';
import { fetchBookingRequests, filtersToParams } from '../api';
import type { BookingRequestFilters } from '../types';

/**
 * Inbox yêu cầu đặt xe — server data (TanStack Query), phân trang server-side.
 * Chi nhánh lọc qua quan hệ XE được yêu cầu (xem `useBookings` cho cùng lý do).
 */
export function useBookingRequests(filters: BookingRequestFilters) {
  const branchScope = useBranchScopeParams();
  const params = { ...filtersToParams(filters), ...branchScope };
  return useQuery({
    queryKey: queryKeys.bookingRequests.list(params),
    queryFn: () => fetchBookingRequests({ ...filters, ...branchScope }),
    placeholderData: keepPreviousData,
  });
}
