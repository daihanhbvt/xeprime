import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { keepPageData } from '@/queries/keep-page-data';
import { queryKeys } from '@/queries/query-keys';
import {
  vehicleFiltersToParams,
  vehiclesApi,
  type VehicleAlertGroup,
  type VehicleFilters,
  type VehicleListItem,
  type VehicleStats,
} from '../api';

/**
 * MỘT trang đội xe. Lọc, sắp xếp và cắt trang đều ở SERVER — không kéo cả kho về rồi lọc tại chỗ.
 *
 * Giữ dữ liệu cũ khi ĐỔI TRANG, không giữ khi đổi bộ lọc (xem `keepPageData`).
 */
/**
 * Số xe mỗi lần tải. 10 — quyết định của người dùng 03/09/2026.
 *
 * Một thẻ xe cao ~180pt, màn 390×844 thấy được bốn thẻ; 10 thẻ là hơn hai màn cuộn, đủ để lần
 * tải sau bắt đầu trước khi người dùng chạm đáy mà không kéo về một mớ chưa ai nhìn tới.
 */
export const VEHICLES_PAGE_SIZE = 10;

/**
 * Đội xe — tải VÔ HẠN trên đúng API phân trang sẵn có (`page/limit/total/hasNext`): trang 1 → 2
 * → 3 nối tiếp, KHÔNG gọi lại trang đã có.
 *
 * Cùng khuôn `useInfinitePublicListings` của màn tìm kiếm — hai màn danh sách dài của app phải
 * cuộn giống nhau, và khuôn đó đã giải xong ba việc khó: khoá theo NỘI DUNG bộ lọc, khử trùng
 * id giữa hai trang, và tách lỗi trang-đầu với lỗi trang-kế.
 *
 * Query key = bộ lọc (đã bỏ `page`): đổi lọc/sắp xếp là key mới → TanStack tự về trang 1 và bỏ
 * response cũ đang bay. Quay lại từ màn chi tiết trong `gcTime` thì mọi trang trả từ cache tức
 * thì, giữ nguyên vị trí cuộn.
 */
export function useInfiniteVehicles(filters: Omit<VehicleFilters, 'page' | 'limit'>) {
  // So theo NỘI DUNG bộ lọc (chuỗi hoá) — object mới mỗi render nhưng key không được đổi oan.
  const serialized = JSON.stringify(vehicleFiltersToParams(filters as VehicleFilters));

  const baseFilters = useMemo(
    () => ({ ...filters, limit: VEHICLES_PAGE_SIZE }) as VehicleFilters,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `serialized` đại diện trọn bộ lọc
    [serialized],
  );

  const query = useInfiniteQuery({
    queryKey: queryKeys.vehicles.list({
      ...vehicleFiltersToParams(baseFilters),
      limit: String(VEHICLES_PAGE_SIZE),
    }),
    queryFn: ({ pageParam }) => vehiclesApi.list({ ...baseFilters, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.meta.hasNext ? last.meta.page + 1 : undefined),
  });

  /**
   * Phẳng hoá + KHỬ TRÙNG id: dữ liệu đổi giữa hai lần tải (xe mới chen vào trang trước) có thể
   * làm một xe xuất hiện ở hai trang — trùng key React và người dùng thấy xe đúp.
   */
  const items = useMemo(() => {
    const seen = new Set<string>();
    const out: VehicleListItem[] = [];
    for (const page of query.data?.pages ?? []) {
      for (const vehicle of page.items) {
        if (seen.has(vehicle.id)) continue;
        seen.add(vehicle.id);
        out.push(vehicle);
      }
    }
    return out;
  }, [query.data]);

  /*
   * Giữ nguyên THAM CHIẾU giữa các lần render: `fetchNextPage` đi thẳng vào `onEndReached` của
   * FlatList, một hàm mới mỗi render là một lần FlatList so prop và gắn lại giữa lúc đang cuộn.
   *
   * Phụ thuộc TỪNG THỨ cần thiết chứ không phải cả `query` — TanStack trả object mới mỗi render.
   */
  const { fetchNextPage: loadMore, refetch, isFetchingNextPage, hasNextPage } = query;

  const fetchNextPage = useCallback(() => {
    if (!isFetchingNextPage && hasNextPage) void loadMore();
  }, [loadMore, isFetchingNextPage, hasNextPage]);
  const retry = useCallback(() => void refetch(), [refetch]);

  return {
    items,
    total: query.data?.pages[0]?.meta.total ?? 0,
    /** Đang tải TRANG ĐẦU — chưa có gì để xem, dựng khung xương toàn vùng. */
    isInitialLoading: query.isLoading,
    /** Lỗi khi CHƯA có trang nào — màn lỗi toàn vùng. */
    initialError: query.isError && !query.data ? query.error : null,
    /** Lỗi trang KẾ — danh sách đang hiện vẫn giữ nguyên, chỉ một dòng thử lại ở đáy. */
    appendError: query.isError && query.data ? query.error : null,
    /** Kéo-làm-mới do người dùng, KHÔNG tính lúc nối trang (xem `SearchResultsScreen`). */
    isRefreshing: query.isRefetching && !query.isFetchingNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage,
    fetchNextPage,
    retry,
  };
}

export function useVehiclesPage(filters: VehicleFilters) {
  const params = vehicleFiltersToParams(filters);

  return useQuery({
    queryKey: queryKeys.vehicles.list(params),
    queryFn: () => vehiclesApi.list(filters),
    placeholderData: keepPageData<Awaited<ReturnType<typeof vehiclesApi.list>>>(params),
  });
}

/**
 * Chỉ số của các xe ĐANG HIỆN trên trang — một truy vấn riêng, gọi sau khi có danh sách.
 *
 * Tách khỏi `useVehiclesPage` vì tổng hợp thu/chi chậm hơn truy vấn xe: gộp chung là bắt cả
 * trang chờ theo phần chậm nhất, và một lỗi thống kê sẽ kéo sập cả danh sách.
 *
 * Khoá ôm danh sách id ĐÃ SẮP XẾP: đổi trang hay đổi bộ lọc là một mục cache khác, còn quay lại
 * trang cũ thì dùng lại cache thay vì gọi lại.
 */
export function useVehicleStats(ids: readonly string[]) {
  const key = [...ids].sort();

  const query = useQuery({
    queryKey: queryKeys.vehicles.stats(key),
    queryFn: () => vehiclesApi.stats(key),
    enabled: key.length > 0,
  });

  // Cùng THAM CHIẾU khi dữ liệu chưa đổi — `renderItem` của màn xe phụ thuộc vào map này, và
  // một map mới mỗi render là một `renderItem` mới, tức FlatList dựng lại cả danh sách con.
  const byId = useMemo(() => {
    const map = new Map<string, VehicleStats>();
    for (const row of query.data ?? []) map.set(row.vehicleId, row);
    return map;
  }, [query.data]);

  return {
    byId,
    isLoading: query.isLoading && key.length > 0,
    isError: query.isError,
  };
}

/**
 * Việc cần làm + KM hiện tại của các xe đang hiện trên trang.
 *
 * Trả ra CẢ `isError` và `refetch`, và nơi gọi phải truyền tiếp xuống thẻ xe: thiếu chúng thì
 * "gọi API hỏng" trông y hệt "xe này không có việc gì" — trên một bề mặt vận hành, đó là sự im
 * lặng nguy hiểm nhất.
 */
export function useVehicleAlerts(ids: readonly string[]) {
  const key = [...ids].sort();

  const query = useQuery({
    queryKey: queryKeys.vehicles.alerts(key),
    queryFn: () => vehiclesApi.alerts(key),
    enabled: key.length > 0,
  });

  const byId = useMemo(() => {
    const map = new Map<string, VehicleAlertGroup>();
    for (const row of query.data ?? []) map.set(row.vehicleId, row);
    return map;
  }, [query.data]);

  const { refetch: refetchAlerts } = query;
  const refetch = useCallback(() => void refetchAlerts(), [refetchAlerts]);

  return {
    byId,
    isLoading: query.isLoading && key.length > 0,
    isError: query.isError,
    refetch,
  };
}

/**
 * Đếm đội xe theo trạng thái vận hành — nói về CẢ đội xe, không phụ thuộc trang hay bộ lọc.
 *
 * Hỏng thì dải chỉ số tự ẩn: nó là phụ trợ, không được chặn danh sách phía dưới.
 */
export function useFleetSummary(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.vehicles.fleetSummary(),
    queryFn: () => vehiclesApi.fleetSummary(),
    enabled,
  });
}
