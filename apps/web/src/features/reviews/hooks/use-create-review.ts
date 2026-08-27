'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { createReview } from '../api';

/**
 * Tạo đánh giá → làm mới các chuyến của khách và điểm đánh giá công khai của xe.
 *
 * `trips.all` là nhánh BẮT BUỘC: `canReview`/`hasReview` và khối "Đánh giá của bạn" đều nằm
 * trong DTO chuyến. Thiếu nó thì gửi xong nút `Đánh giá chuyến đi` vẫn đứng nguyên và bấm lần
 * hai sẽ ăn 409 từ server — người dùng không có cách nào hiểu chuyện gì vừa xảy ra ngoài việc
 * F5 cả trang.
 */
export function useCreateReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createReview,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.trips.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.reviews.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.marketplace.all });
    },
  });
}
