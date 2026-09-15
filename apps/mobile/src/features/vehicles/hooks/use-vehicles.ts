import { useInfiniteQuery, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { useBranchScopeParams } from '@/features/branches/hooks/use-branch-scope';
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
  /*
   * Bộ chọn chi nhánh ở thanh trên ghép vào ĐÂY chứ không ở từng màn (cùng chỗ web ghép):
   * `branchId` nằm trong bộ lọc nên nó vào query key, đổi chi nhánh là tự tải lại, và không màn
   * nào có cơ hội quên gửi tham số.
   */
  const branchScope = useBranchScopeParams();
  // So theo NỘI DUNG bộ lọc (chuỗi hoá) — object mới mỗi render nhưng key không được đổi oan.
  const serialized = JSON.stringify(
    vehicleFiltersToParams({ ...filters, ...branchScope } as VehicleFilters),
  );

  const baseFilters = useMemo(
    () => ({ ...filters, ...branchScope, limit: VEHICLES_PAGE_SIZE }) as VehicleFilters,
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
  const branchScope = useBranchScopeParams();
  const scoped = { ...filters, ...branchScope };
  const params = vehicleFiltersToParams(scoped);

  return useQuery({
    queryKey: queryKeys.vehicles.list(params),
    queryFn: () => vehiclesApi.list(scoped),
    placeholderData: keepPageData<Awaited<ReturnType<typeof vehiclesApi.list>>>(params),
  });
}

/**
 * Chia danh sách id đang hiện thành các LÔ CỐ ĐỊNH để mỗi lô là một mục cache riêng.
 *
 * Vì sao không khoá theo cả danh sách: `items` của cuộn vô hạn là danh sách CỘNG DỒN, nên nối
 * thêm một trang là đổi khoá — TanStack coi đó là một truy vấn hoàn toàn mới, trạng thái chờ bật
 * lên cho MỌI thẻ đang nhìn thấy (chúng nháy về khung xương giữa lúc ngón tay đang cuộn), và
 * request mới hỏi lại chỉ số của cả những xe vừa trả lời xong. Lưu lượng tăng theo bình phương
 * số trang, và cú khựng rơi đúng vào lúc người dùng chạm đáy.
 *
 * Chia lô theo đúng `VEHICLES_PAGE_SIZE` thì ranh giới lô trùng ranh giới trang: trang đã tải
 * xong có khoá bất biến và không bao giờ bị hỏi lại, nối trang chỉ sinh THÊM một truy vấn cho
 * đúng 10 xe mới. Thẻ cũ giữ nguyên dữ liệu, `memo` của `VehicleCard` so props thấy không đổi
 * nên không dựng lại.
 *
 * Lô cuối có thể còn dở (trang cuối chưa đủ 10) và sẽ đổi khoá một lần khi trang kế về — một
 * truy vấn thừa cho tối đa 9 xe, đổi lấy phép chia không cần trạng thái.
 */
function chunkIds(ids: readonly string[]): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += VEHICLES_PAGE_SIZE) {
    out.push(ids.slice(i, i + VEHICLES_PAGE_SIZE));
  }
  return out;
}

/**
 * Kết quả gộp của một bộ truy vấn theo lô, phẳng về đúng hình dạng mà thẻ xe cần.
 *
 * `pendingIds` là ĐANG CHỜ theo TỪNG XE, không phải một cờ chung: chỉ thẻ chưa có chỉ số mới
 * dựng khung xương. Một cờ chung sẽ kéo cả danh sách đã có dữ liệu về khung xương mỗi lần nối
 * trang — chính lỗi mà cách chia lô này sinh ra để tránh.
 */
interface FacetResult<T> {
  byId: Map<string, T>;
  pendingIds: Set<string>;
  isError: boolean;
}

/**
 * Bộ truy vấn theo lô dùng chung cho chỉ số và cảnh báo.
 *
 * `combine` của `useQueries` ghi nhớ kết quả theo danh tính của từng truy vấn con, nên `byId`
 * giữ NGUYÊN THAM CHIẾU chừng nào chưa lô nào đổi dữ liệu — điều kiện để `renderItem` của màn
 * danh sách không đổi danh tính giữa lúc cuộn.
 */
function useVehicleFacet<T>(
  ids: readonly string[],
  queryKeyFor: (chunk: readonly string[]) => readonly unknown[],
  fetcher: (chunk: readonly string[]) => Promise<T[]>,
  idOf: (row: T) => string,
): FacetResult<T> {
  const chunks = chunkIds(ids);

  return useQueries({
    queries: chunks.map((chunk) => ({
      queryKey: queryKeyFor(chunk),
      queryFn: () => fetcher(chunk),
      enabled: chunk.length > 0,
    })),
    combine: (results): FacetResult<T> => {
      const byId = new Map<string, T>();
      const pendingIds = new Set<string>();
      let isError = false;

      results.forEach((result, index) => {
        const chunk = chunks[index] ?? [];
        if (result.isError) isError = true;
        if (result.isPending) {
          for (const id of chunk) pendingIds.add(id);
          return;
        }
        for (const row of result.data ?? []) byId.set(idOf(row), row);
      });

      return { byId, pendingIds, isError };
    },
  });
}

/**
 * Chỉ số của các xe ĐANG HIỆN trên trang — truy vấn riêng, gọi sau khi có danh sách.
 *
 * Tách khỏi `useVehiclesPage` vì tổng hợp thu/chi chậm hơn truy vấn xe: gộp chung là bắt cả
 * trang chờ theo phần chậm nhất, và một lỗi thống kê sẽ kéo sập cả danh sách.
 */
export function useVehicleStats(ids: readonly string[]) {
  return useVehicleFacet<VehicleStats>(
    ids,
    (chunk) => queryKeys.vehicles.stats(chunk),
    (chunk) => vehiclesApi.stats(chunk),
    (row) => row.vehicleId,
  );
}

/**
 * Việc cần làm + KM hiện tại của các xe đang hiện trên trang.
 *
 * Trả ra CẢ `isError` và `refetch`, và nơi gọi phải truyền tiếp xuống thẻ xe: thiếu chúng thì
 * "gọi API hỏng" trông y hệt "xe này không có việc gì" — trên một bề mặt vận hành, đó là sự im
 * lặng nguy hiểm nhất.
 */
export function useVehicleAlerts(ids: readonly string[]) {
  const facet = useVehicleFacet<VehicleAlertGroup>(
    ids,
    (chunk) => queryKeys.vehicles.alerts(chunk),
    (chunk) => vehiclesApi.alerts(chunk),
    (row) => row.vehicleId,
  );

  /*
   * Thử lại là thử lại MỌI lô, không riêng lô hỏng: nút này nằm ở đầu danh sách và nói về cả
   * danh sách. Vô hiệu hoá theo TIỀN TỐ khoá thay vì giữ tham chiếu `refetch` của từng lô — số
   * lô đổi theo số trang đã cuộn, một danh sách hàm thì không giữ nổi tham chiếu ổn định.
   */
  const queryClient = useQueryClient();
  const refetch = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.alertsAll() });
  }, [queryClient]);

  return { ...facet, refetch };
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
