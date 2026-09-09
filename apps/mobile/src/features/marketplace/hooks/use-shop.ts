import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import type { PaginationMeta } from '@xeprime/types';
import { queryKeys } from '@/queries/query-keys';
import { marketplaceApi, type PublicListing, type PublicShop } from '../api';

/** Cùng con số với lưới xe của gian hàng bên web (`ShopVehicleGrid`). */
const PAGE_SIZE = 12;

/** Hồ sơ gian hàng công khai. Web render server-side cho SEO; native fetch như mọi màn khác. */
export function usePublicShop(slug: string) {
  return useQuery({
    queryKey: queryKeys.marketplace.shop(slug),
    queryFn: (): Promise<PublicShop> => marketplaceApi.shop(slug),
  });
}

interface ShopListingsPage {
  listings: PublicListing[];
  meta: PaginationMeta;
}

/**
 * Xe của một gian hàng — tải VÔ HẠN trên đúng API phân trang web đang dùng.
 *
 * Web có bộ phân trang số trang vì URL giữ được `?page=`; native cuộn tiếp, nên trang 1 → 2 → 3
 * nối đuôi nhau. Khác biệt về HÌNH THÁI điều hướng, không phải về dữ liệu: cùng endpoint, cùng
 * kích thước trang, cùng thứ tự.
 *
 * Lỗi tách đôi giống `useInfinitePublicListings`: hỏng ở trang ĐẦU là màn lỗi cả khối, hỏng ở
 * trang KẾ chỉ là một dòng thử lại dưới đáy — danh sách đang xem không được biến mất.
 */
export function useInfiniteShopListings(slug: string) {
  const query = useInfiniteQuery({
    queryKey: queryKeys.marketplace.shopListingsInfinite(slug, { limit: PAGE_SIZE }),
    queryFn: async ({ pageParam, signal }): Promise<ShopListingsPage> => {
      const { items, meta } = await marketplaceApi.shopListings(
        slug,
        { page: pageParam, limit: PAGE_SIZE },
        signal,
      );
      return { listings: items, meta };
    },
    initialPageParam: 1,
    getNextPageParam: (last) => (last.meta.hasNext ? last.meta.page + 1 : undefined),
  });

  /** Khử trùng id: xe mới chen vào trang trước có thể làm một xe rơi vào hai trang. */
  const listings = useMemo(() => {
    const seen = new Set<string>();
    const out: PublicListing[] = [];
    for (const page of query.data?.pages ?? []) {
      for (const listing of page.listings) {
        if (seen.has(listing.id)) continue;
        seen.add(listing.id);
        out.push(listing);
      }
    }
    return out;
  }, [query.data]);

  // Giữ nguyên tham chiếu: `fetchNextPage` đi thẳng vào `onEndReached` của FlatList.
  const { fetchNextPage: loadMore, refetch, isFetchingNextPage, hasNextPage } = query;

  const fetchNextPage = useCallback(() => {
    if (!isFetchingNextPage && hasNextPage) void loadMore();
  }, [loadMore, isFetchingNextPage, hasNextPage]);
  const retryInitial = useCallback(() => void refetch(), [refetch]);
  const retryNextPage = useCallback(() => void loadMore(), [loadMore]);

  return {
    listings,
    total: query.data?.pages[0]?.meta.total ?? 0,
    isInitialLoading: query.isLoading,
    initialError: query.isError && !query.data ? query.error : null,
    appendError: query.isError && query.data ? query.error : null,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage,
    retryInitial,
    retryNextPage,
  };
}
