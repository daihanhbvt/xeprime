'use client';

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { API_ERROR_CODE } from '@xeprime/types';
import { getErrorCode } from '@/services/api-client';
import { queryKeys } from '@/services/query-keys';
import { cancelTrip, fetchTrip, fetchTrips, tripsToParams } from './api';

/** Danh sách chuyến của khách. Lọc + phân trang ở server; `filter` sống trên URL (ADR 0004). */
export function useTrips(filter: string, page: number) {
  return useQuery({
    queryKey: queryKeys.trips.list(tripsToParams(filter, page)),
    queryFn: () => fetchTrips(filter, page),
    // Đổi tab không nháy sang trống rồi mới có dữ liệu.
    placeholderData: keepPreviousData,
  });
}

/** Một chuyến. `id` nhận cả id yêu cầu lẫn id đơn — thông báo trỏ vào cả hai loại. */
export function useTrip(id: string) {
  return useQuery({
    queryKey: queryKeys.trips.detail(id),
    queryFn: () => fetchTrip(id),
    enabled: Boolean(id),
  });
}

/**
 * Khách tự huỷ chuyến.
 *
 * Server trả về chính chuyến đã đổi chặng nên ghi thẳng vào cache chi tiết — màn cập nhật ngay,
 * không nháy qua trạng thái cũ. Danh sách thì phải `invalidate`: số đếm trên từng tab do server
 * tính, đoán lại ở client là cách chắc chắn để tab "Chờ xác nhận" đứng sai một đơn vị.
 */
export function useCancelTrip(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => cancelTrip(id),
    onSuccess: (trip) => {
      queryClient.setQueryData(queryKeys.trips.detail(id), trip);
      void queryClient.invalidateQueries({ queryKey: queryKeys.trips.all });
    },
    /*
     * `TRIP_CANCEL_NOT_ALLOWED` nghĩa là chuyến đã sang chặng khác kể từ lúc màn này tải —
     * gian hàng vừa duyệt, hoặc vừa bấm giao xe. Màn đang cầm dữ liệu cũ, nên ngoài việc báo
     * lỗi phải kéo lại trạng thái thật: nút "Huỷ chuyến" tự biến mất thay vì mời bấm lại một
     * việc chắc chắn hỏng.
     */
    onError: (error) => {
      if (getErrorCode(error) === API_ERROR_CODE.TRIP_CANCEL_NOT_ALLOWED) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.trips.all });
      }
    },
  });
}
