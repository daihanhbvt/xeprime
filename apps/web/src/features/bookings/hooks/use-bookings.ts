'use client';

import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { fetchBookings, filtersToParams } from '../api';
import { LIVE_REFRESH_MS } from '@/features/booking-requests/hooks/use-booking-requests';
import type { BookingFilters } from '../types';

/**
 * Danh sách đơn thuê — server data (TanStack Query, ADR 0004). Luôn phân trang server-side.
 * `keepPreviousData` giữ trang cũ trong lúc tải trang mới để bảng không nhấp nháy về rỗng.
 *
 * Chi nhánh lọc qua quan hệ XE của đơn ở backend; giá trị đến từ ô "Chi nhánh" của trang, tức
 * từ URL (ADR 0052).
 */
export function useBookings(
  filters: BookingFilters,
  options: { enabled?: boolean; live?: boolean } = {},
) {
  const params = filtersToParams(filters);
  return useQuery({
    queryKey: queryKeys.bookings.list(params),
    queryFn: () => fetchBookings(filters),
    placeholderData: keepPreviousData,
    // Màn "Quản lý đơn thuê xe" giữ cả truy vấn của ô "Tất cả" lẫn của một ngăn, chỉ bật cái đang xem.
    enabled: options.enabled ?? true,
    // Cùng nhịp với hộp thư yêu cầu: đơn mới ra đời khi tiền giữ chỗ về, lượt giao/trả đổi nhóm.
    refetchInterval: options.live ? LIVE_REFRESH_MS : false,
  });
}

/**
 * Một CỘT đơn trên bảng Kanban — cùng hình thái với `useBookingRequestsInfinite`: cuộn tải trang kế,
 * khoá dưới khoá danh sách cùng tham số (đuôi `infinite`), `live` tắt trong lúc kéo thẻ.
 */
export function useBookingsInfinite(
  filters: Omit<BookingFilters, 'page'>,
  options: { enabled?: boolean; live?: boolean } = {},
) {
  const params = filtersToParams(filters);
  return useInfiniteQuery({
    queryKey: [...queryKeys.bookings.list(params), 'infinite'] as const,
    queryFn: ({ pageParam }) => fetchBookings({ ...filters, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.meta.hasNext ? last.meta.page + 1 : undefined),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
    refetchInterval: options.live ? LIVE_REFRESH_MS : false,
  });
}
