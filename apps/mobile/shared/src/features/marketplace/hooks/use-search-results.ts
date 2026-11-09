import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import type { PaginationMeta } from '@xeprime/types';
import { ApiClientError, CLIENT_ERROR_CODE } from '@/lib/api-client';
import { queryKeys } from '@/queries/query-keys';
import {
  marketplaceApi,
  toListingQueryParams,
  type MarketplaceFilters,
  type PublicListing,
  type PublicListingFacets,
} from '../api';

/** Lỗi đại diện cho lượt tải đầu bị TẠM DỪNG vì offline — `isOfflineError` nhận ra nó. */
const OFFLINE_PAUSED = new ApiClientError({ code: CLIENT_ERROR_CODE.NETWORK_ERROR, message: 'offline', status: 0 });

const PAGE_SIZE = 12;

interface ListingsPage {
  listings: PublicListing[];
  meta: PaginationMeta;
}

/**
 * Danh sách xe cho màn kết quả — tải VÔ HẠN trên đúng API phân trang sẵn có
 * (`page/limit/total/hasNext`): trang 1 → 2 → 3 nối tiếp, KHÔNG refetch trang đã có.
 *
 * Query key = bộ filter (đã bỏ `page`): đổi filter/sort là key mới → TanStack tự reset về trang
 * 1 và bỏ response cũ đang bay. Quay lại từ trang chi tiết trong `gcTime` thì mọi trang đã tải
 * trả về từ cache tức thì — giữ nguyên vị trí cuộn.
 *
 * Lỗi được TÁCH ĐÔI ở đây thay vì để màn hình tự suy: lỗi TRANG ĐẦU (chưa có gì để xem — màn
 * lỗi toàn vùng) khác hẳn lỗi TRANG KẾ (đang có N xe trên màn — chỉ một dòng thử lại ở đáy).
 */
export function useInfinitePublicListings(filters: MarketplaceFilters) {
  // So theo NỘI DUNG filter (chuỗi hoá) — object mới mỗi render nhưng key không được đổi oan.
  const serialized = JSON.stringify({
    ...toListingQueryParams(filters),
    sort: filters.sort ?? null,
  });

  const baseFilters = useMemo(
    () => ({ ...filters, limit: PAGE_SIZE }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- serialized đại diện trọn bộ filter
    [serialized],
  );

  const query = useInfiniteQuery({
    queryKey: queryKeys.marketplace.listingsInfinite({
      ...toListingQueryParams(baseFilters),
      sort: baseFilters.sort ?? null,
      limit: PAGE_SIZE,
    }),
    queryFn: async ({ pageParam, signal }): Promise<ListingsPage> => {
      const { items, meta } = await marketplaceApi.listings(
        { ...baseFilters, page: pageParam },
        signal,
      );
      return { listings: items, meta };
    },
    initialPageParam: 1,
    getNextPageParam: (last) => (last.meta.hasNext ? last.meta.page + 1 : undefined),
    /*
     * Đổi bộ lọc/sắp xếp = key mới. Không giữ kết quả cũ thì danh sách rơi về khung chờ rồi mới
     * hiện kết quả mới — cú nháy mỗi lần bấm một chip. Giữ trang cũ tới khi trang mới về.
     */
    placeholderData: keepPreviousData,
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

  /*
   * Ba hàm dưới giữ nguyên THAM CHIẾU giữa các lần render.
   *
   * `fetchNextPage` đi thẳng vào `onEndReached` của FlatList; một hàm mới mỗi render là một
   * lần FlatList so prop và gắn lại.
   *
   * Phụ thuộc vào TỪNG THỨ cần thiết chứ không phải cả `query`: TanStack trả về một object mới
   * mỗi render, lấy nó làm phụ thuộc thì `useCallback` chẳng giữ được gì. `fetchNextPage` và
   * `refetch` của TanStack vốn ổn định; hai cờ kia chỉ đổi ở ranh giới trang, không đổi theo
   * từng khung hình cuộn.
   */
  const { fetchNextPage: loadMore, refetch, isFetchingNextPage, hasNextPage } = query;

  const fetchNextPage = useCallback(() => {
    if (!isFetchingNextPage && hasNextPage) void loadMore();
  }, [loadMore, isFetchingNextPage, hasNextPage]);
  const retryInitial = useCallback(() => void refetch(), [refetch]);
  const retryNextPage = useCallback(() => void loadMore(), [loadMore]);

  return {
    listings,
    total: query.data?.pages[0]?.meta.total ?? 0,
    /** Đang tải TRANG ĐẦU (chưa có gì hiển thị). */
    isInitialLoading: query.isLoading,
    /**
     * Lỗi khi CHƯA có trang nào — màn lỗi toàn vùng.
     *
     * Kể cả lượt TẠM DỪNG vì offline (`isPaused`): TanStack không ném lỗi mà để query nằm chờ
     * mạng, nên `isLoading` = false và màn rơi xuống trạng thái RỖNG — báo "0 kết quả / chưa có xe
     * nào" là nói sai. Trả một lỗi mạng để `ScreenError` hiện đúng "Không có kết nối mạng"; mạng
     * về thì query tự chạy tiếp và màn lỗi tự biến mất.
     */
    initialError:
      query.isError && !query.data
        ? query.error
        : query.isPaused && (!query.data || query.isPlaceholderData)
          ? OFFLINE_PAUSED
          : null,
    /** Lỗi khi tải TRANG KẾ — kết quả đã có vẫn giữ nguyên, chỉ hiện thử lại ở đáy. */
    appendError: query.isError && query.data ? query.error : null,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    /**
     * Đang tải lại TỪ ĐẦU do người dùng kéo — không tính lúc nối trang.
     *
     * `isRefetching` của TanStack bật cả khi `fetchNextPage` chạy, nên dùng trần thì vòng quay
     * kéo-làm-mới hiện lên mỗi lần cuộn tới đáy.
     */
    // Đang hiện kết quả CŨ chờ bộ lọc mới ⇒ không phải kéo-làm-mới, đừng bật vòng quay.
    isRefreshing: query.isRefetching && !query.isFetchingNextPage && !query.isPlaceholderData,
    /** Đang hiện kết quả của bộ lọc TRƯỚC trong lúc chờ bộ lọc mới. */
    isPlaceholderData: query.isPlaceholderData,
    refresh: retryInitial,
    /** Guard sẵn chống gọi trùng — chỗ gọi cứ gọi, hook tự bỏ qua khi đang bay hoặc hết trang. */
    fetchNextPage,
    retryInitial,
    retryNextPage,
  };
}

/**
 * Số đếm facet cho tấm Bộ lọc — gọi với bản NHÁP filter, để số đếm và nút "Áp dụng (N xe)" chạy
 * theo lựa chọn chưa áp dụng.
 *
 * `keepPreviousData` giữ số cũ trong lúc tải nên các con số không nhấp nháy về 0 mỗi lần chạm.
 */
export function useListingFacets(filters: MarketplaceFilters, enabled = true) {
  return useQuery({
    queryKey: queryKeys.marketplace.facets(toListingQueryParams(filters)),
    queryFn: (): Promise<PublicListingFacets> => marketplaceApi.facets(filters),
    placeholderData: keepPreviousData,
    enabled,
  });
}
