import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { FavoriteVehicle, VehicleType } from '@xeprime/types';
import { fetchFavoritesPages } from '@/api/favorites/api';
import { queryKeys } from '@/queries/query-keys';

/**
 * Cỡ khối khi tải — cùng con số web: lần đầu 1 khối (5 xe), mỗi lần "Xem thêm" 2 khối (10 xe). Gọi
 * server theo khối CỐ ĐỊNH 5 thay vì đổi `limit` giữa chừng — `page=2&limit=10` là xe 11–20, sẽ
 * bỏ sót 6–10.
 */
export const FAVORITE_LIST_CHUNK = 5;
const FIRST_LOAD_CHUNKS = 1;
const LOAD_MORE_CHUNKS = 2;

/**
 * Danh sách một tab — bản native của web `useFavoritesList`. Khoá nằm dưới
 * `queryKeys.favorites.lists` (CHUNG với web) để thao tác bỏ thích gỡ/khôi phục thẻ lạc quan được.
 *
 * Tab Ô tô / Xe máy là state cục bộ của màn (native không có URL); mặc định
 * `FAVORITE_DEFAULT_VEHICLE_TYPE` như web, không nhớ tab lần trước (BRD §9 câu 5).
 */
export function useFavoritesList(vehicleType: VehicleType) {
  const query = useInfiniteQuery({
    queryKey: queryKeys.favorites.list({ vehicleType }),
    queryFn: ({ pageParam, signal }) =>
      fetchFavoritesPages(
        vehicleType,
        pageParam,
        pageParam === 1 ? FIRST_LOAD_CHUNKS : LOAD_MORE_CHUNKS,
        FAVORITE_LIST_CHUNK,
        { signal },
      ),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.meta.hasNext ? last.meta.page + 1 : undefined),
  });

  /** Phẳng hoá + khử trùng id — dữ liệu đổi giữa hai lần tải có thể đẩy một xe sang trang kế. */
  const items = useMemo(() => {
    const seen = new Set<string>();
    const out: FavoriteVehicle[] = [];
    for (const page of query.data?.pages ?? []) {
      for (const item of page.items) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        out.push(item);
      }
    }
    return out;
  }, [query.data]);

  return {
    items,
    total: query.data?.pages[0]?.meta.total ?? 0,
    isInitialLoading: query.isLoading,
    initialError: query.isError && !query.data ? query.error : null,
    appendError: query.isError && query.data ? query.error : null,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: () => {
      if (!query.isFetchingNextPage && query.hasNextPage) void query.fetchNextPage();
    },
    retry: () => void query.refetch(),
    /** Lời hứa làm mới cho kéo-để-làm-mới (`usePullRefresh`) — vòng quay chỉ hiện khi khách kéo. */
    refresh: query.refetch,
  };
}
