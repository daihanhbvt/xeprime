'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import {
  FAVORITE_DEFAULT_VEHICLE_TYPE,
  VEHICLE_TYPE_VALUES,
  type FavoriteVehicle,
  type VehicleType,
} from '@xeprime/types';
import { queryKeys } from '@/services/query-keys';
import { fetchFavoritesPages } from '../api';

/**
 * Cỡ khối khi tải: lần đầu 1 khối (5 xe), mỗi lần "Xem thêm" 2 khối (10 xe). Gọi server theo
 * khối CỐ ĐỊNH 5 thay vì đổi `limit` giữa chừng — `page=2&limit=10` là xe 11–20, sẽ bỏ sót 6–10.
 */
export const FAVORITE_LIST_CHUNK = 5;
const FIRST_LOAD_CHUNKS = 1;
const LOAD_MORE_CHUNKS = 2;

/** Tham số URL của tab — `?type=motorbike`; tab mặc định (Ô tô) không mang tham số. */
export const FAVORITE_TAB_PARAM = 'type';

function isVehicleType(value: string | null | undefined): value is VehicleType {
  return VEHICLE_TYPE_VALUES.includes(value as VehicleType);
}

/**
 * Tab đang mở sống trên URL (ADR 0004): gửi link được, F5 không mất, Back quay đúng tab. Luôn mở
 * Ô tô khi không có tham số (giả định đã chốt cho BRD §9 câu 5 — không nhớ tab lần trước).
 */
export function useFavoriteTab() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const raw = params?.get(FAVORITE_TAB_PARAM);
  const vehicleType: VehicleType = isVehicleType(raw) ? raw : FAVORITE_DEFAULT_VEHICLE_TYPE;

  const setVehicleType = useCallback(
    (next: VehicleType) => {
      const search = new URLSearchParams(params?.toString() ?? '');
      if (next === FAVORITE_DEFAULT_VEHICLE_TYPE) search.delete(FAVORITE_TAB_PARAM);
      else search.set(FAVORITE_TAB_PARAM, next);
      const qs = search.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  return { vehicleType, setVehicleType };
}

/**
 * Danh sách một tab — tải tiếp theo trang server (`page/limit/hasNext`), không kéo cả danh sách.
 * Khoá nằm dưới `queryKeys.favorites.lists` để thao tác bỏ thích gỡ/khôi phục thẻ lạc quan được
 * (`favorite-cache.ts`).
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
  };
}
