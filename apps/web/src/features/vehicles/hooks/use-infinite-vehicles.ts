'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import type { PaginationMeta } from '@xeprime/types';
import { useMemo } from 'react';
import { useBranchScopeParams } from '@/features/branches/hooks/use-branch-scope';
import { fetchPage } from '@/services/api-client';
import { queryKeys } from '@/services/query-keys';
import type { VehicleListItem } from '../types';

/** Vừa một màn lưới thẻ, đủ nhỏ để trang đầu về nhanh trong overlay. */
const PAGE_SIZE = 24;

interface VehiclesPage {
  vehicles: VehicleListItem[];
  meta: PaginationMeta;
}

/**
 * Đội xe của gian hàng, TẢI DẦN theo cuộn — dùng đúng API phân trang sẵn có
 * (`page/limit/total/hasNext`): trang 1 → 2 → 3 nối tiếp, KHÔNG nâng `limit` để kéo cả bảng.
 *
 * Vì sao cần: bộ chọn xe trước đây gọi `limit=100` một phát. Gian hàng lớn có hàng trăm xe —
 * một request nặng, kéo về cả dữ liệu không ai cuộn tới, và vẫn CẮT ở xe thứ 100 nên xe thứ
 * 101 không có cách nào chọn được.
 *
 * Cùng hình thái với `useInfinitePublicListings` của `/search` (khử trùng id, tách lỗi trang
 * đầu ↔ trang kế, guard chống gọi trùng) — một cách làm cho cả hai bề mặt tải-dần.
 */
export function useInfiniteVehicles(q: string) {
  const branchScope = useBranchScopeParams();
  const serialized = JSON.stringify({ q, ...branchScope });
  const baseParams = useMemo(
    () => ({ q: q || null, ...branchScope, limit: PAGE_SIZE }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- serialized đại diện trọn bộ tham số
    [serialized],
  );

  const query = useInfiniteQuery({
    queryKey: queryKeys.vehicles.infinite(baseParams),
    queryFn: async ({ pageParam, signal }): Promise<VehiclesPage> => {
      const { items, meta } = await fetchPage<VehicleListItem>(
        '/vehicles',
        { ...baseParams, page: pageParam },
        PAGE_SIZE,
        { signal },
      );
      return { vehicles: items, meta };
    },
    initialPageParam: 1,
    getNextPageParam: (last) => (last.meta.hasNext ? last.meta.page + 1 : undefined),
  });

  /** Phẳng hoá + khử trùng id: xe mới chen vào trang trước có thể lặp ở hai trang. */
  const vehicles = useMemo(() => {
    const seen = new Set<string>();
    const out: VehicleListItem[] = [];
    for (const page of query.data?.pages ?? []) {
      for (const vehicle of page.vehicles) {
        if (seen.has(vehicle.id)) continue;
        seen.add(vehicle.id);
        out.push(vehicle);
      }
    }
    return out;
  }, [query.data]);

  return {
    vehicles,
    total: query.data?.pages[0]?.meta.total ?? 0,
    /** Đang tải TRANG ĐẦU (chưa có gì hiển thị) — màn skeleton. */
    isInitialLoading: query.isLoading,
    /** Lỗi khi CHƯA có trang nào — màn lỗi toàn vùng. */
    initialError: query.isError && !query.data ? query.error : null,
    /** Lỗi khi tải TRANG KẾ — danh sách đang có giữ nguyên, chỉ hiện thử lại ở đáy. */
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
