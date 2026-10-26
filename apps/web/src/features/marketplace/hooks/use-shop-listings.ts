'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { PaginationMeta } from '@xeprime/types';
import { fetchPage } from '@/services/api-client';
import { queryKeys } from '@/services/query-keys';
import type { MarketplaceFilters, PublicListing } from '../types';

const DEFAULT_LIMIT = 12;

export interface ShopListingsResult {
  listings: PublicListing[];
  meta: PaginationMeta;
}

/** Các chiều lọc mà `GET /public/shops/:slug/listings` nhận — tab tỉnh + chip của trang gian hàng. */
export type ShopListingFilters = Pick<
  MarketplaceFilters,
  'provinceCode' | 'serviceType' | 'delivery' | 'instantBook' | 'noCollateral' | 'vatInvoice'
>;

/**
 * Xe công khai của một gian hàng — server data (TanStack Query, ADR 0004); trang và bộ lọc sống ở
 * URL (`useMarketplaceFilters`). Boolean đi trên dây là `1`, đúng quy ước của trang tìm kiếm, vì
 * backend đọc cùng một DTO.
 */
export function useShopListings(slug: string, page: number, filters: ShopListingFilters = {}) {
  const params = {
    page,
    limit: DEFAULT_LIMIT,
    provinceCode: filters.provinceCode ?? null,
    serviceType: filters.serviceType ?? null,
    delivery: filters.delivery ? '1' : null,
    instantBook: filters.instantBook ? '1' : null,
    noCollateral: filters.noCollateral ? '1' : null,
    vatInvoice: filters.vatInvoice ? '1' : null,
  };
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
