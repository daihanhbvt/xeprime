'use client';

import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { fetchBookingRequests, filtersToParams } from '../api';
import type { BookingRequestFilters } from '../types';

/**
 * Inbox yêu cầu đặt xe — server data (TanStack Query), phân trang server-side.
 *
 * Chi nhánh lọc qua quan hệ XE được yêu cầu; backend áp nó cho CẢ `meta.statusCounts`, nên con
 * số trên hàng tab và danh sách bên dưới luôn nói cùng một phạm vi.
 */
export function useBookingRequests(
  filters: BookingRequestFilters,
  options: { enabled?: boolean; live?: boolean } = {},
) {
  const params = filtersToParams(filters);
  return useQuery({
    queryKey: queryKeys.bookingRequests.list(params),
    queryFn: () => fetchBookingRequests(filters),
    placeholderData: keepPreviousData,
    // Màn "Đơn thuê xe" giữ nhiều truy vấn nhóm, chỉ bật cái đang xem.
    enabled: options.enabled ?? true,
    /*
     * `live`: một ca trực để màn mở cả buổi — yêu cầu mới tới, khách trả xong tiền giữ chỗ (thẻ
     * sang "Chờ giao xe"), hạn phản hồi trôi qua. Làm mới nền mỗi `LIVE_REFRESH_MS`, CHỈ khi tab
     * đang hiện (mặc định của TanStack Query), không chặn ai đang đọc.
     */
    refetchInterval: options.live ? LIVE_REFRESH_MS : false,
  });
}

/**
 * Một CỘT yêu cầu trên bảng Kanban — cuộn tới đâu tải trang kế tới đó (`useInfiniteQuery`), vẫn phân
 * trang server-side. Khoá nằm DƯỚI khoá danh sách cùng tham số (thêm đuôi `infinite`) để mọi lượt
 * làm mới danh sách yêu cầu (`bookingRequests.all`) kéo theo cột, mà hai hình dữ liệu (một trang /
 * nhiều trang) không bao giờ dùng chung một mục cache.
 *
 * `live`: làm mới nền mọi trang đã tải mỗi `LIVE_REFRESH_MS`; bảng TẮT nó trong lúc đang kéo thẻ để
 * thẻ đang cầm không biến mất dưới tay.
 */
export function useBookingRequestsInfinite(
  filters: Omit<BookingRequestFilters, 'page'>,
  options: { enabled?: boolean; live?: boolean } = {},
) {
  const params = filtersToParams(filters);
  return useInfiniteQuery({
    queryKey: [...queryKeys.bookingRequests.list(params), 'infinite'] as const,
    queryFn: ({ pageParam }) => fetchBookingRequests({ ...filters, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.meta.hasNext ? last.meta.page + 1 : undefined),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
    refetchInterval: options.live ? LIVE_REFRESH_MS : false,
  });
}

/** Nhịp làm mới nền của các danh sách "đang sống" trên màn "Đơn thuê xe". */
export const LIVE_REFRESH_MS = 30_000;
