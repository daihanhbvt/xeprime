'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { PaginationMeta } from '@xeprime/types';
import { fetchPage } from '@/services/api-client';
import { queryKeys } from '@/services/query-keys';
import type { PublicListing } from '../types';

const DEFAULT_LIMIT = 12;

export interface ShopListingsResult {
  listings: PublicListing[];
  meta: PaginationMeta;
}

/**
 * Xe công khai của một gian hàng — server data (TanStack Query, ADR 0004), phân trang qua `page`
 * ở URL. Tái dùng envelope `{ data, meta }` chuẩn.
 */
export function useShopListings(slug: string, page: number) {
  const params = { page, limit: DEFAULT_LIMIT };
  return useQuery({
    queryKey: queryKeys.marketplace.shopListings(slug, params),
    queryFn: async (): Promise<ShopListingsResult> => {
      const { items, meta } = await fetchPage<PublicListing>(
        `/public/shops/${encodeURIComponent(slug)}/listings`,
        params,
        DEFAULT_LIMIT,
      );
      return { listings: items, meta };
    },
    placeholderData: keepPreviousData,
  });
}
