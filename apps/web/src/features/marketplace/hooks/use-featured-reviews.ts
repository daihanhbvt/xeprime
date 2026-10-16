'use client';

import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/services/api-client';
import { queryKeys } from '@/services/query-keys';
import type { FeaturedReview } from '../types';

/**
 * "Khách hàng nói gì về XePrime" — đánh giá THẬT đã công khai (`/public/reviews/featured`): từ 4
 * sao, có lời nhận xét đủ dài, của gian hàng đang hoạt động. Server chọn và giới hạn số lượng;
 * trang chủ không biên tập tay, không có câu trích dẫn mẫu.
 */
export function useFeaturedReviews(limit: number) {
  return useQuery({
    queryKey: queryKeys.marketplace.featuredReviews(limit),
    queryFn: async (): Promise<FeaturedReview[]> => {
      const res = await apiRequest<FeaturedReview[]>('/public/reviews/featured', {
        query: { limit },
      });
      return res.data;
    },
    // Đánh giá mới đổi theo ngày, không theo phút.
    staleTime: 10 * 60_000,
  });
}
