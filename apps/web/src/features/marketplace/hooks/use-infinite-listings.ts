'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import type { PaginationMeta } from '@xeprime/types';
import { useMemo } from 'react';
import { apiRequest } from '@/services/api-client';
import { queryKeys } from '@/services/query-keys';
import { toListingQueryParams } from '../filter-params';
import type { MarketplaceFilters, PublicListing } from '../types';

const PAGE_SIZE = 12;

interface ListingsPage {
  listings: PublicListing[];
  meta: PaginationMeta;
}

/**
 * Danh sách xe cho `/search` — tải VÔ HẠN trên đúng API phân trang sẵn có
 * (`page/limit/total/hasNext`): trang 1 → 2 → 3 nối tiếp, KHÔNG refetch các trang đã có và
 * không tăng `limit` để kéo lại từ đầu.
 *
 * Query key = bộ filter (đã bỏ `page`): đổi filter/sort là key mới → TanStack tự reset về trang
 * 1 và tự bỏ response cũ đang bay (không dính stale). Quay lại từ trang chi tiết trong `gcTime`
 * thì mọi trang đã tải trả về từ cache tức thì — giữ nguyên vị trí cuộn.
 *
 * Lỗi được TÁCH ĐÔI ở đây thay vì để component tự suy: lỗi TRANG ĐẦU (chưa có gì để xem — màn
 * lỗi toàn vùng) khác lỗi TRANG KẾ (đang có N xe trên màn — chỉ một dòng thử lại ở đáy).
 */
export function useInfinitePublicListings(filters: MarketplaceFilters) {
  // So theo NỘI DUNG filter (chuỗi hoá) — object mới mỗi render nhưng key không được đổi oan.
  const serialized = JSON.stringify({
    ...toListingQueryParams(filters),
    sort: filters.sort ?? null,
  });
  const baseParams = useMemo(
    () => ({ ...toListingQueryParams(filters), sort: filters.sort ?? null, limit: PAGE_SIZE }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- serialized đại diện trọn bộ filter
    [serialized],
  );

  const query = useInfiniteQuery({
    queryKey: queryKeys.marketplace.listingsInfinite(baseParams),
    queryFn: async ({ pageParam, signal }): Promise<ListingsPage> => {
      const res = await apiRequest<PublicListing[]>('/public/listings', {
        query: { ...baseParams, page: pageParam },
        signal,
      });
      return {
        listings: res.data,
        meta: (res.meta as PaginationMeta | undefined) ?? {
          page: pageParam,
          limit: PAGE_SIZE,
          total: res.data.length,
          hasNext: false,
        },
      };
    },
    initialPageParam: 1,
    getNextPageParam: (last) => (last.meta.hasNext ? last.meta.page + 1 : undefined),
  });

  /**
   * Phẳng hoá + KHỬ TRÙNG id: dữ liệu đổi giữa hai lần tải (xe mới chen vào trang trước) có thể
   * làm một xe xuất hiện ở hai trang — trùng key React và người dùng thấy xe đúp.
   */
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

  const total = query.data?.pages[0]?.meta.total ?? 0;

  return {
    listings,
    total,
    /** Đang tải TRANG ĐẦU (chưa có gì hiển thị). */
    isInitialLoading: query.isLoading,
    /** Lỗi khi CHƯA có trang nào — màn lỗi toàn vùng. */
    initialError: query.isError && !query.data ? query.error : null,
    /** Lỗi khi tải TRANG KẾ — kết quả đã có vẫn giữ nguyên, chỉ hiện thử lại ở đáy. */
    appendError: query.isError && query.data ? query.error : null,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    /** Guard sẵn chống gọi trùng — sentinel cứ gọi, hook tự bỏ qua khi đang bay/hết trang. */
    fetchNextPage: () => {
      if (!query.isFetchingNextPage && query.hasNextPage) void query.fetchNextPage();
    },
    retryInitial: () => void query.refetch(),
    retryNextPage: () => void query.fetchNextPage(),
  };
}
