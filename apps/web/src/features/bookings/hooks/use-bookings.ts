'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { fetchBookings, filtersToParams } from '../api';
import type { BookingFilters } from '../types';

/**
 * Danh sách đơn thuê — server data (TanStack Query, ADR 0004). Luôn phân trang server-side.
 * `keepPreviousData` giữ trang cũ trong lúc tải trang mới để bảng không nhấp nháy về rỗng.
 *
 * Chi nhánh lọc qua quan hệ XE của đơn ở backend; giá trị đến từ ô "Chi nhánh" của trang, tức
 * từ URL (ADR 0052).
 */
export function useBookings(filters: BookingFilters) {
  const params = filtersToParams(filters);
  return useQuery({
    queryKey: queryKeys.bookings.list(params),
    queryFn: () => fetchBookings(filters),
    placeholderData: keepPreviousData,
  });
}
