import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ServiceType } from '@xeprime/types';
import { queryKeys } from '@/queries/query-keys';
import {
  TRIP_HISTORY_PAGE_SIZE,
  tripHistoryFiltersToParams,
  vehicleSettingsApi,
  type PatchVehicleServiceSettingInput,
  type SaveDriverSurchargeRuleInput,
  type SaveVehicleOperationSettingsInput,
  type VehicleTripHistoryItem,
} from '../api';

/**
 * Mọi mutation ở đây làm mới nhánh `vehicles` (thiết lập, hồ sơ 360, thẻ xe) VÀ nhánh chi tiết xe
 * công khai: khung giờ, điều khoản, phụ phí và "đặt nhanh" đều hiện ở trang xe — lưu xong mà
 * trang công khai còn nói số cũ là hai màn kể hai chuyện. Cùng danh sách web invalidate.
 */
function useInvalidateVehicleSettings(vehicleId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.detail(vehicleId) });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.vehicles.operationSettings(vehicleId),
    });
    void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.serviceSettings(vehicleId) });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.vehicles.driverSurchargeRules(vehicleId),
    });
    void queryClient.invalidateQueries({ queryKey: queryKeys.marketplace.listing(vehicleId) });
  };
}

export function useVehicleOperationSettings(vehicleId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.vehicles.operationSettings(vehicleId),
    queryFn: () => vehicleSettingsApi.operationSettings(vehicleId),
    enabled: Boolean(vehicleId) && enabled,
  });
}

export function useSaveVehicleOperationSettings(vehicleId: string) {
  const invalidate = useInvalidateVehicleSettings(vehicleId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SaveVehicleOperationSettingsInput) =>
      vehicleSettingsApi.saveOperationSettings(vehicleId, body),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.vehicles.operationSettings(vehicleId), data);
      invalidate();
    },
  });
}

export function useVehicleServiceSettings(vehicleId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.vehicles.serviceSettings(vehicleId),
    queryFn: () => vehicleSettingsApi.serviceSettings(vehicleId),
    enabled: Boolean(vehicleId) && enabled,
  });
}

export function usePatchVehicleServiceSetting(vehicleId: string, serviceType: ServiceType) {
  const invalidate = useInvalidateVehicleSettings(vehicleId);
  return useMutation({
    mutationFn: (body: PatchVehicleServiceSettingInput) =>
      vehicleSettingsApi.patchServiceSetting(vehicleId, serviceType, body),
    onSuccess: invalidate,
  });
}

export function useDriverSurchargeRules(vehicleId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.vehicles.driverSurchargeRules(vehicleId),
    queryFn: () => vehicleSettingsApi.driverSurchargeRules(vehicleId),
    enabled: Boolean(vehicleId) && enabled,
  });
}

export function useSaveDriverSurchargeRules(vehicleId: string) {
  const invalidate = useInvalidateVehicleSettings(vehicleId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (items: SaveDriverSurchargeRuleInput[]) =>
      vehicleSettingsApi.saveDriverSurchargeRules(vehicleId, items),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.vehicles.driverSurchargeRules(vehicleId), data);
      invalidate();
    },
  });
}

/**
 * Lịch sử chuyến của một xe — CUỘN VÔ HẠN thay cho thanh phân trang của web.
 *
 * Khác biệt về TRÌNH BÀY, không về dữ liệu: cùng endpoint, cùng tham số `filter`/`page`/`limit`,
 * server vẫn cắt trang. Một thanh số trang trên điện thoại là mười vùng chạm 24dp cạnh nhau.
 */
export function useVehicleTripHistory(vehicleId: string, filter: string, enabled = true) {
  const query = useInfiniteQuery({
    queryKey: queryKeys.vehicles.tripHistory(
      vehicleId,
      tripHistoryFiltersToParams({ filter, limit: TRIP_HISTORY_PAGE_SIZE }),
    ),
    queryFn: ({ pageParam }) =>
      vehicleSettingsApi.tripHistory(vehicleId, {
        filter,
        page: pageParam,
        limit: TRIP_HISTORY_PAGE_SIZE,
      }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.meta.hasNext ? last.meta.page + 1 : undefined),
    enabled: Boolean(vehicleId) && enabled,
  });

  /*
   * Khử trùng theo `key` — đơn và yêu cầu trộn chung một dòng thời gian nên DTO không có `id`
   * duy nhất, `key` là thứ server dựng cho đúng việc này. Một chuyến chen vào trang trước sẽ xuất
   * hiện ở hai trang, và hai dòng cùng key là key React trùng.
   */
  const seen = new Set<string>();
  const items: VehicleTripHistoryItem[] = [];
  for (const page of query.data?.pages ?? []) {
    for (const trip of page.items) {
      if (seen.has(trip.key)) continue;
      seen.add(trip.key);
      items.push(trip);
    }
  }

  return {
    items,
    total: query.data?.pages[0]?.meta.total ?? 0,
    isInitialLoading: query.isLoading,
    initialError: query.isError && !query.data ? query.error : null,
    appendError: query.isError && query.data ? query.error : null,
    isRefreshing: query.isRefetching && !query.isFetchingNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: () => {
      if (!query.isFetchingNextPage && query.hasNextPage) void query.fetchNextPage();
    },
    retry: () => void query.refetch(),
  };
}
