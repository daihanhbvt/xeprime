'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { fetchVehicleOptions } from '../api';

/**
 * Xe gợi ý cho ô "Liên kết xe" của form tạo phiếu.
 *
 * Song song với `useBookingOptions`: chỉ chạy khi form đang mở, và tìm ở SERVER vì một gian hàng
 * lớn có nhiều xe hơn thứ tải nổi một lần.
 *
 * `includeId` là xe đang chọn sẵn (mở form từ hồ sơ xe). Nó đi vào query key chứ không lọc ở
 * client: đổi xe đang chọn là đổi tập kết quả server phải trả, nên hai lần gọi khác `includeId`
 * không được dùng chung một ô cache.
 */
export function useVehicleOptions(q: string, enabled: boolean, includeId?: string | null) {
  return useQuery({
    queryKey: queryKeys.receipts.vehicleOptions({
      q: q.trim() || null,
      includeId: includeId || null,
    }),
    queryFn: () => fetchVehicleOptions(q, includeId),
    enabled,
    placeholderData: keepPreviousData,
  });
}
