import { useQuery } from '@tanstack/react-query';
import { STALE_TIME } from '@xeprime/api-client';
import type { PaginationMeta } from '@xeprime/types';
import { FIRST_PAGE } from '@/queries/use-clamped-page';
import { queryKeys } from '@/queries/query-keys';
import {
  marketplaceApi,
  toListingQueryParams,
  DEFAULT_LISTING_LIMIT,
  type MarketplaceFilters,
  type PublicBanner,
  type PublicDestination,
  type PublicListing,
  type PublicShopSummary,
} from '../api';

/** Số đánh giá tiêu biểu hiện ở trang chi tiết — cùng con số web dùng. */
const REVIEW_LIMIT = 5;

/**
 * Server data của marketplace — TanStack Query (ADR 0004).
 *
 * Query key lấy từ `@xeprime/api-client` nên khớp từng phần tử với web: hai client gọi cùng
 * endpoint mà đặt key khác nhau thì mọi thứ vẫn chạy, cho tới lúc một `invalidateQueries`
 * chỉ làm mới đúng một nửa.
 *
 * Phần GỌI nằm ở `marketplaceApi` (dùng chung), ở đây chỉ còn phần cache.
 */

export interface PublicListingsResult {
  listings: PublicListing[];
  meta: PaginationMeta;
}

export function usePublicListings(filters: MarketplaceFilters) {
  const params = {
    ...toListingQueryParams(filters),
    sort: filters.sort ?? null,
    page: filters.page ?? FIRST_PAGE,
    limit: filters.limit ?? DEFAULT_LISTING_LIMIT,
  };

  return useQuery({
    queryKey: queryKeys.marketplace.listings(params),
    queryFn: async ({ signal }): Promise<PublicListingsResult> => {
      const { items, meta } = await marketplaceApi.listings(filters, signal);
      return { listings: items, meta };
    },
  });
}

export function useDestinations(limit: number) {
  return useQuery({
    queryKey: queryKeys.marketplace.destinations({ limit }),
    queryFn: (): Promise<PublicDestination[]> => marketplaceApi.destinations(limit),
    // Số liệu tổng hợp, đổi chậm — không cần refetch liên tục.
    staleTime: STALE_TIME.REFERENCE,
  });
}

export interface FeaturedShopsResult {
  shops: PublicShopSummary[];
  meta: PaginationMeta;
}

export function useFeaturedShops(limit: number) {
  return useQuery({
    queryKey: queryKeys.marketplace.shops({ page: FIRST_PAGE, limit }),
    queryFn: async (): Promise<FeaturedShopsResult> => {
      const { items, meta } = await marketplaceApi.shops(limit);
      return { shops: items, meta };
    },
    staleTime: STALE_TIME.REFERENCE,
  });
}

/** Hồ sơ đầy đủ của MỘT xe. Web render server-side cho SEO; native fetch như mọi màn khác. */
export function useListing(vehicleId: string) {
  return useQuery({
    queryKey: queryKeys.marketplace.listing(vehicleId),
    queryFn: () => marketplaceApi.listing(vehicleId),
  });
}

/**
 * Đánh giá công khai của một xe.
 *
 * Lỗi KHÔNG ném lên: khối đánh giá tự ẩn chứ không kéo cả trang chi tiết xuống màn lỗi — cùng
 * cách web xử lý (`fetchListingReviews` trả `null` khi hỏng).
 */
export function useListingReviews(vehicleId: string, limit = REVIEW_LIMIT) {
  return useQuery({
    queryKey: queryKeys.marketplace.reviews(vehicleId, { limit }),
    queryFn: () => marketplaceApi.reviews(vehicleId, limit).catch(() => null),
  });
}

/**
 * Banner hero. Lỗi KHÔNG ném lên: trang chủ rơi về hero mặc định chứ không sập vì một mục
 * marketing — cùng cách xử lý với `fetchBannersServer` bên web.
 */
export function useBanners() {
  return useQuery({
    queryKey: queryKeys.banners.list(),
    queryFn: (): Promise<PublicBanner[]> => marketplaceApi.banners().catch(() => []),
    staleTime: STALE_TIME.STANDARD,
  });
}
