'use client';

import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/services/api-client';
import { queryKeys } from '@/services/query-keys';
import type { PublicDestination } from '../types';

/**
 * "Địa điểm nổi bật" — tỉnh/thành đang thực sự có xe, kèm số xe đếm từ backend (ADR 0004:
 * server data ở TanStack Query). Danh sách tỉnh KHÔNG hardcode ở FE; `provinceName` trả về
 * dùng luôn làm giá trị lọc `province`.
 */
export function useDestinations(limit: number) {
  const params = { limit };
  return useQuery({
    queryKey: queryKeys.marketplace.destinations(params),
    queryFn: async (): Promise<PublicDestination[]> => {
      const res = await apiRequest<PublicDestination[]>('/public/destinations', { query: params });
      return res.data;
    },
    // Số liệu tổng hợp, đổi chậm — không cần refetch liên tục.
    staleTime: 5 * 60_000,
  });
}
