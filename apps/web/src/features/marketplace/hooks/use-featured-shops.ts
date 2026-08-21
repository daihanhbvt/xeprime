'use client';

import { useQuery } from '@tanstack/react-query';
import type { PaginationMeta } from '@xeprime/types';
import { fetchPage } from '@/services/api-client';
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
      const { items, meta } = await fetchPage<PublicShopSummary>('/public/shops', params, limit);
      return { shops: items, meta };
    },
    staleTime: 5 * 60_000,
  });
}
