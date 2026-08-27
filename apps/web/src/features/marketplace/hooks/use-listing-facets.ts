'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/services/api-client';
import { queryKeys } from '@/services/query-keys';
import { toListingQueryParams } from '../filter-params';
import type { MarketplaceFilters, PublicListingFacets } from '../types';

/**
 * Facet counts cho panel Bộ lọc — gọi với DRAFT filter (đã debounce ở phía panel) để số đếm
 * và nút "Áp dụng (N xe)" chạy theo lựa chọn chưa commit. `keepPreviousData` giữ số cũ trong
 * lúc fetch nên UI không nhấp nháy về 0.
 */
export function useListingFacets(filters: MarketplaceFilters, options?: { enabled?: boolean }) {
  const params = toListingQueryParams(filters);
  return useQuery({
    queryKey: queryKeys.marketplace.facets(params),
    queryFn: async (): Promise<PublicListingFacets> => {
      const res = await apiRequest<PublicListingFacets>('/public/listings/facets', {
        query: params,
      });
      return res.data;
    },
    placeholderData: keepPreviousData,
    enabled: options?.enabled ?? true,
  });
}
