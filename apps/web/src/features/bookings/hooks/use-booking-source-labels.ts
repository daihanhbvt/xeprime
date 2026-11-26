'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { fetchBookingSourceLabels } from '../api';

/**
 * Nhãn nguồn đơn gian hàng đã từng nhập (ADR 0110) - mới dùng nhất trước. Dùng cho ô gợi ý của hộp
 * lập đơn / đổi nguồn và cho bộ lọc "Nguồn đơn". Nằm dưới nhánh `bookings` nên mọi lượt tạo / đổi
 * đơn tự làm mới danh sách này.
 */
export function useBookingSourceLabels(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.bookings.sourceLabels,
    queryFn: fetchBookingSourceLabels,
    enabled: options.enabled ?? true,
    staleTime: 60_000,
  });
}
