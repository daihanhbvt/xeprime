'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { addDateKeyDays, vnDateKey } from '@xeprime/types';
import { buildBusyDayIndex } from '@/lib/rental-busy';
import { queryKeys } from '@/services/query-keys';
import { BUSY_DAYS_LOOKAHEAD, fetchVehicleBusyDays } from '../api';

/**
 * Lịch bận của một xe cho ô chọn ngày giờ — nạp MỘT lần cho cả năm, không phải mỗi lần lật tháng.
 *
 * Cửa sổ lùi một ngày so với hôm nay theo giờ VN: máy khách ở múi giờ âm có thể đang ở "hôm qua"
 * so với ngày nghiệp vụ, và ô đầu tiên trên lịch không được phép trống dữ liệu.
 *
 * Đây chỉ là PREVIEW cho lịch (khoá ngày kín, tô ngày bận vài giờ). Chốt thật là constraint chống
 * trùng ở DB (ADR 0006), và hộp gửi yêu cầu vẫn kiểm khung giờ trống trước khi cho gửi.
 *
 * `enabled = false` cho thuê dài hạn: không có ô chọn khoảng nhận–trả (ADR 0011).
 */
export function useVehicleBusyDays(vehicleId: string, enabled = true) {
  const span = useMemo(() => {
    const from = addDateKeyDays(vnDateKey(new Date()), -1);
    return { from, to: addDateKeyDays(from, BUSY_DAYS_LOOKAHEAD) };
  }, []);
  const query = useQuery({
    queryKey: queryKeys.bookingRequests.busyDays(vehicleId, span.from, span.to),
    queryFn: () => fetchVehicleBusyDays(vehicleId, span.from, span.to),
    enabled,
    staleTime: 60_000,
  });
  const busyDays = useMemo(() => buildBusyDayIndex(query.data?.days), [query.data]);
  return { busyDays, busyLoading: query.isLoading };
}
