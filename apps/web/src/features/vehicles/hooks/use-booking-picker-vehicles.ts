'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import type { PaginationMeta } from '@xeprime/types';
import { useMemo } from 'react';
import { fetchPage } from '@/services/api-client';
import { queryKeys } from '@/services/query-keys';
import type { VehicleBookingPickerItem } from '../types';

/** Bốn cột × sáu hàng — vừa một màn lưới thẻ, đủ nhỏ để trang đầu về nhanh trong overlay. */
const PAGE_SIZE = 24;

export interface BookingPickerFilters {
  q: string;
  branchId?: string | null;
  vehicleType: string;
  /** ISO-8601 UTC. Thiếu một trong hai đầu thì hook KHÔNG gọi — khung giờ là bắt buộc. */
  pickupAt: string | null;
  returnAt: string | null;
}

interface PickerPage {
  vehicles: VehicleBookingPickerItem[];
  meta: PaginationMeta;
}

/**
 * Xe cho bước "Chọn xe" của hộp Tạo đơn thuê (`GET /vehicles/booking-picker`), TẢI DẦN theo
 * cuộn: trang 1 → 2 → 3 nối tiếp, không nâng `limit` để kéo cả đội xe (gian hàng lớn có hàng
 * trăm xe, và một lần `limit=100` vừa nặng vừa cắt mất xe thứ 101).
 *
 * Server xếp xe TRỐNG trong khung giờ lên trước, xe đã có lịch xuống sau kèm `busy` — nên đổi
 * khung giờ là một bộ lọc mới (key mới), không phải tô lại dữ liệu cũ.
 *
 * `branchId` là THAM SỐ chứ không phải thứ hook tự đi đọc (ADR 0052): chi nhánh ở bước này là
 * GỢI Ý mở được, mặc định theo màn đang lọc nhưng nhân viên vẫn điều được xe từ nơi khác sang.
 */
export function useBookingPickerVehicles(filters: BookingPickerFilters) {
  const serialized = JSON.stringify(filters);
  const baseParams = useMemo(
    () => ({
      q: filters.q || null,
      branchId: filters.branchId ?? null,
      vehicleType: filters.vehicleType,
      pickupAt: filters.pickupAt,
      returnAt: filters.returnAt,
      limit: PAGE_SIZE,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- serialized đại diện trọn bộ tham số
    [serialized],
  );
  const ready = Boolean(filters.pickupAt && filters.returnAt);

  const query = useInfiniteQuery({
    queryKey: queryKeys.vehicles.bookingPicker(baseParams),
    queryFn: async ({ pageParam, signal }): Promise<PickerPage> => {
      const { items, meta } = await fetchPage<VehicleBookingPickerItem>(
        '/vehicles/booking-picker',
        { ...baseParams, page: pageParam },
        PAGE_SIZE,
        { signal },
      );
      return { vehicles: items, meta };
    },
    enabled: ready,
    initialPageParam: 1,
    getNextPageParam: (last) => (last.meta.hasNext ? last.meta.page + 1 : undefined),
    // Lịch xe đổi theo từng đơn — mở lại hộp phải thấy lịch mới, không phải bản cũ trong cache.
    staleTime: 0,
  });

  /** Phẳng hoá + khử trùng id: xe đổi nhóm trống/bận giữa hai trang có thể lặp lại. */
  const vehicles = useMemo(() => {
    const seen = new Set<string>();
    const out: VehicleBookingPickerItem[] = [];
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
    isInitialLoading: ready && query.isLoading,
    /** Lỗi khi CHƯA có trang nào — màn lỗi toàn vùng. */
    initialError: query.isError && !query.data ? query.error : null,
    /** Lỗi khi tải TRANG KẾ — danh sách đang có giữ nguyên, chỉ hiện thử lại ở đáy. */
    appendError: query.isError && query.data ? query.error : null,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: () => {
      if (query.hasNextPage && !query.isFetchingNextPage && !query.isError) {
        void query.fetchNextPage();
      }
    },
    retryInitial: () => void query.refetch(),
    retryNextPage: () => void query.fetchNextPage(),
  };
}
