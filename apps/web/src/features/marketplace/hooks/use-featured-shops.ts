'use client';

import { useQuery } from '@tanstack/react-query';
import type { PaginationMeta } from '@xeprime/types';
import { apiRequest } from '@/services/api-client';
import { queryKeys } from '@/services/query-keys';
import type { PublicShopSummary } from '../types';

export interface FeaturedShopsResult {
  shops: PublicShopSummary[];
  meta: PaginationMeta;
}

/**
 * "Gian hàng nổi bật" — shop đang hoạt động có xe công khai, sắp theo điểm đánh giá. Phân trang
 * ở backend; trang chủ chỉ lấy trang đầu với `limit` nhỏ.
 */
export function useFeaturedShops(limit: number) {
  const params = { page: 1, limit };
  return useQuery({
    queryKey: queryKeys.marketplace.shops(params),
    queryFn: async (): Promise<FeaturedShopsResult> => {
      const res = await apiRequest<PublicShopSummary[]>('/public/shops', { query: params });
      return {
        shops: res.data,
        meta: (res.meta as PaginationMeta | undefined) ?? {
          page: 1,
          limit,
          total: res.data.length,
          hasNext: false,
        },
      };
    },
    staleTime: 5 * 60_000,
  });
}
