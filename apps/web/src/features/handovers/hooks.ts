'use client';

import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryParams } from '@/services/api-client';
import { queryKeys } from '@/services/query-keys';
import { fetchHandoverContext, fetchMissingOdometerQueue } from './api';

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

/** Hàng đợi "Thiếu KM trả" toàn gian hàng — nhóm việc của Trung tâm bảo dưỡng (Wave 8). */
export function useMissingOdometerQueue(params: QueryParams, enabled = true) {
  return useQuery({
    queryKey: queryKeys.maintenance.missingReturnKm(params),
    queryFn: () => fetchMissingOdometerQueue(params),
    enabled,
    placeholderData: keepPreviousData,
  });
}

/**
 * Sau mỗi thao tác bàn giao: làm mới đơn (trạng thái vừa đổi), lịch (chỗ vừa nhả), cụm
 * bảo dưỡng/KM của xe (số KM vừa nhảy) VÀ mọi bề mặt của xe (Wave 8: thẻ ở danh sách và
 * Hồ sơ 360 đều hiện cảnh báo/KM lấy từ cùng dữ liệu đó).
 *
 * Tất cả đổi trong MỘT transaction ở backend, nên ở client chúng cũng phải cùng được làm mới —
 * để sót một nhánh là để lại một màn hình kể chuyện cũ.
 */
export function useInvalidateHandovers(bookingId: string, vehicleId?: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.handovers(bookingId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.detail(bookingId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.maintenance.all });
    // Nhánh `vehicles` gồm danh sách + stats + alerts + summary + cụm bảo dưỡng của từng xe.
    void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
    if (vehicleId) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.detail(vehicleId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.maintenance(vehicleId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.summary(vehicleId) });
    }
  };
}
