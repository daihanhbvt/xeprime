'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { fetchBookingOptions } from '../api';

/**
 * Đơn gợi ý cho ô "Liên kết đơn thuê".
 *
 * Chỉ chạy khi form đang mở (`enabled`) — danh sách này không có giá trị gì cho tới lúc người
 * dùng bắt đầu tạo phiếu, và nó chạm bảng `bookings`.
 */
export function useBookingOptions(q: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.receipts.bookingOptions({ q: q.trim() || null }),
    queryFn: () => fetchBookingOptions(q),
    enabled,
    placeholderData: keepPreviousData,
  });
}
