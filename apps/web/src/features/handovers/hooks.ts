'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { fetchHandoverContext } from './api';

/**
 * Ngữ cảnh bàn giao của một đơn. `enabled` tắt khi thiếu `handovers.view` — không gọi API
 * chỉ để nhận 403.
 */
export function useHandoverContext(bookingId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.bookings.handovers(bookingId ?? ''),
    queryFn: () => fetchHandoverContext(bookingId!),
    enabled: Boolean(bookingId) && enabled,
    retry: false, // 403/404 là câu trả lời, không phải lỗi tạm
  });
}

/**
 * Sau mỗi thao tác bàn giao: làm mới đơn (trạng thái vừa đổi), lịch (chỗ vừa nhả) và cụm
 * bảo dưỡng/KM của xe (số KM vừa nhảy) — ba thứ đó cùng thay đổi trong một transaction ở
 * backend nên ở client cũng phải cùng được làm mới.
 */
export function useInvalidateHandovers(bookingId: string, vehicleId?: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.handovers(bookingId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.detail(bookingId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.maintenance.all });
    if (vehicleId) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.maintenance(vehicleId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.summary(vehicleId) });
    }
  };
}
