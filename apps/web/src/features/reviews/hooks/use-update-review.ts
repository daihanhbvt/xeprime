'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { updateReview } from '../api';

/**
 * Sửa đánh giá (MỘT lần) → làm mới chuyến (`review.canEdit` về false, hiện "Đã chỉnh sửa") và
 * điểm đánh giá công khai — cùng các nhánh với `useCreateReview`.
 */
export function useUpdateReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateReview,
    onSettled: () => {
      // Cả khi lỗi (409 đã sửa ở tab khác): tải lại để nút sửa biến mất theo server.
      void queryClient.invalidateQueries({ queryKey: queryKeys.trips.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.reviews.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.marketplace.all });
    },
  });
}
