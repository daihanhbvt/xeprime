import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { vehiclesApi, type VehicleBookingPickerItem } from '@/api/vehicles/api';
import { queryKeys } from '@/queries/query-keys';

/** Cùng cỡ trang với web — đủ nhỏ để trang đầu về nhanh. */
const PAGE_SIZE = 24;

export interface BookingPickerFilters {
  q: string;
  branchId?: string | null | undefined;
  vehicleType: string;
  /** ISO-8601 UTC. Thiếu một trong hai đầu thì hook KHÔNG gọi — khung giờ là bắt buộc. */
  pickupAt: string | null;
  returnAt: string | null;
}

/**
 * Xe cho bước "Chọn xe" của luồng lập đơn — native port of web
 * `features/vehicles/hooks/use-booking-picker-vehicles.ts`. Tải dần theo cuộn; server xếp xe TRỐNG
 * lên trước, xe đã có lịch kèm `busy`. Đổi khung giờ là một bộ lọc mới (key mới).
 *
 * `branchId` là THAM SỐ (ADR 0052): chi nhánh ở bước này là GỢI Ý mở được.
 */
export function useBookingPickerVehicles(filters: BookingPickerFilters) {
  const baseParams = useMemo(
    () => ({
      q: filters.q || null,
      branchId: filters.branchId ?? null,
      vehicleType: filters.vehicleType,
      pickupAt: filters.pickupAt,
      returnAt: filters.returnAt,
      limit: PAGE_SIZE,
    }),
    [filters.q, filters.branchId, filters.vehicleType, filters.pickupAt, filters.returnAt],
  );
  const ready = Boolean(filters.pickupAt && filters.returnAt);

  const query = useInfiniteQuery({
    queryKey: queryKeys.vehicles.bookingPicker(baseParams),
    queryFn: ({ pageParam }) =>
      vehiclesApi.bookingPicker({ ...baseParams, page: pageParam }, PAGE_SIZE),
    enabled: ready,
    initialPageParam: 1,
    getNextPageParam: (last) => (last.meta.hasNext ? last.meta.page + 1 : undefined),
    // Lịch xe đổi theo từng đơn — mở lại bước chọn xe phải thấy lịch mới.
    staleTime: 0,
  });

  /** Phẳng hoá + khử trùng id: xe đổi nhóm trống/bận giữa hai trang có thể lặp lại. */
  const vehicles = useMemo(() => {
    const seen = new Set<string>();
    const out: VehicleBookingPickerItem[] = [];
    for (const page of query.data?.pages ?? []) {
      for (const vehicle of page.items) {
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
    isInitialLoading: ready && query.isLoading,
    initialError: query.isError && !query.data ? query.error : null,
    appendError: query.isError && query.data ? query.error : null,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    isRefetching: query.isRefetching && !query.isFetchingNextPage,
    fetchNextPage: () => {
      if (query.hasNextPage && !query.isFetchingNextPage && !query.isError) {
        void query.fetchNextPage();
      }
    },
    refetch: () => void query.refetch(),
    retryNextPage: () => void query.fetchNextPage(),
  };
}
