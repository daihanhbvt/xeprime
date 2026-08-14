'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useBranchScopeParams } from '@/features/branches/hooks/use-branch-scope';
import { queryKeys } from '@/services/query-keys';
import { fetchBookings, filtersToParams } from '../api';
import type { BookingFilters } from '../types';

/**
 * Danh sách đơn thuê — server data (TanStack Query, ADR 0004). Luôn phân trang server-side.
 * `keepPreviousData` giữ trang cũ trong lúc tải trang mới để bảng không nhấp nháy về rỗng.
 *
 * Chi nhánh lọc qua quan hệ XE của đơn (backend), ghép ở đây để mọi màn dùng hook này đều theo
 * bộ chọn ở thanh trên mà không phải tự nhớ.
 */
export function useBookings(filters: BookingFilters) {
  const branchScope = useBranchScopeParams();
  const params = { ...filtersToParams(filters), ...branchScope };
  return useQuery({
    queryKey: queryKeys.bookings.list(params),
    queryFn: () => fetchBookings({ ...filters, ...branchScope }),
    placeholderData: keepPreviousData,
  });
}
