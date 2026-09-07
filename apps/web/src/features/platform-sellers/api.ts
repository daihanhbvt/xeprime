import { DEFAULT_PAGE_SIZE } from '@/constants/filters';
import { apiGet, apiPost, fetchPage, type Paged } from '@/services/api-client';
import type { PlatformSellerFilters, PlatformSellerProfile, ReviewSellerProfileInput } from './types';

export const SELLER_DEFAULT_LIMIT = DEFAULT_PAGE_SIZE;

export type PlatformSellerListResult = Paged<PlatformSellerProfile>;

export function filtersToParams(filters: PlatformSellerFilters) {
  return {
    status: filters.status ?? null,
    q: filters.q ?? null,
    page: filters.page ?? 1,
    limit: filters.limit ?? SELLER_DEFAULT_LIMIT,
  };
}

export const fetchPlatformSellers = (
  filters: PlatformSellerFilters,
): Promise<PlatformSellerListResult> =>
  fetchPage<PlatformSellerProfile>(
    '/platform/seller-profiles',
    filtersToParams(filters),
    SELLER_DEFAULT_LIMIT,
  );

export const fetchPlatformSeller = (id: string): Promise<PlatformSellerProfile> =>
  apiGet<PlatformSellerProfile>(`/platform/seller-profiles/${id}`);

export const verifySeller = (id: string): Promise<PlatformSellerProfile> =>
  apiPost<PlatformSellerProfile>(`/platform/seller-profiles/${id}/verify`);

export const requestSellerChanges = (
  id: string,
  body: ReviewSellerProfileInput,
): Promise<PlatformSellerProfile> =>
  apiPost<PlatformSellerProfile>(`/platform/seller-profiles/${id}/request-changes`, body);

export const rejectSeller = (
  id: string,
  body: ReviewSellerProfileInput,
): Promise<PlatformSellerProfile> =>
  apiPost<PlatformSellerProfile>(`/platform/seller-profiles/${id}/reject`, body);
