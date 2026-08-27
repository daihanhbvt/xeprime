'use client';

import { useQuery } from '@tanstack/react-query';
import type { PaginationMeta } from '@xeprime/types';
import { fetchPage } from '@/services/api-client';
import { queryKeys } from '@/services/query-keys';
import { toListingQueryParams } from '../filter-params';
import type { MarketplaceFilters, PublicListing } from '../types';

const DEFAULT_LIMIT = 12;

export interface PublicListingsResult {
  listings: PublicListing[];
  meta: PaginationMeta;
}

/**
 * Danh sách xe marketplace — server data (TanStack Query, ADR 0004). Luôn phân trang; trả
 * cả `meta` để UI hiện tổng số và nút xem thêm. Serialize filter dùng chung
 * `toListingQueryParams` với hook facets — hai đường không lệch nhau.
 */
export function usePublicListings(filters: MarketplaceFilters) {
  const params = {
    ...toListingQueryParams(filters),
    sort: filters.sort ?? null,
    page: filters.page ?? 1,
    limit: filters.limit ?? DEFAULT_LIMIT,
  };
  return useQuery({
    queryKey: queryKeys.marketplace.listings(params),
    queryFn: async (): Promise<PublicListingsResult> => {
      const { items, meta } = await fetchPage<PublicListing>(
        '/public/listings',
        params,
        DEFAULT_LIMIT,
      );
      return { listings: items, meta };
    },
  });
}
