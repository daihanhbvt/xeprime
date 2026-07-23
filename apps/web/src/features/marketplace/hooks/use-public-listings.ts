'use client';

import { useQuery } from '@tanstack/react-query';
import type { PaginationMeta } from '@xeprime/types';
import { apiRequest, type QueryParams } from '@/services/api-client';
import { queryKeys } from '@/services/query-keys';
import type { MarketplaceFilters, PublicListing } from '../types';

const DEFAULT_LIMIT = 12;

export interface PublicListingsResult {
  listings: PublicListing[];
  meta: PaginationMeta;
}

function toParams(filters: MarketplaceFilters): QueryParams {
  return {
    vehicleType: filters.vehicleType ?? null,
    serviceType: filters.serviceType ?? null,
    brand: filters.brand ?? null,
    minSeats: filters.minSeats ?? null,
    q: filters.q ?? null,
    sort: filters.sort ?? null,
    page: filters.page ?? 1,
    limit: filters.limit ?? DEFAULT_LIMIT,
  };
}

/**
 * Danh sách xe marketplace — server data (TanStack Query, ADR 0004). Luôn phân trang; trả
 * cả `meta` để UI hiện tổng số và nút xem thêm.
 */
export function usePublicListings(filters: MarketplaceFilters) {
  const params = toParams(filters);
  return useQuery({
    queryKey: queryKeys.marketplace.listings(params),
    queryFn: async (): Promise<PublicListingsResult> => {
      const res = await apiRequest<PublicListing[]>('/public/listings', { query: params });
      return {
        listings: res.data,
        meta: (res.meta as PaginationMeta | undefined) ?? {
          page: 1,
          limit: DEFAULT_LIMIT,
          total: res.data.length,
          hasNext: false,
        },
      };
    },
  });
}
