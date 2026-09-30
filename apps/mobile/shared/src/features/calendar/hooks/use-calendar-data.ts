import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { queryKeys, type QueryParams } from '@xeprime/api-client';
import { useBranchScopeParams } from '@/features/branches/hooks/use-branch-scope';
import { calendarApi, calendarRangeParams, type CalendarEvent, type CalendarFilters } from '../api';
import { buildRange, type CalendarRange } from '../utils/calendar-date.util';

/** Khoá tra dấu giá riêng của một ô: `vehicleId:YYYY-MM-DD`. */
export function priceMarkerKey(vehicleId: string, date: string): string {
  return `${vehicleId}:${date}`;
}

export interface PriceMarker {
  dailyPrice: string | null;
  hourlyPrice: string | null;
}

/**
 * Nạp xe + event + hàng "Xe còn trống" + dấu giá riêng cho khoảng đang xem.
 *
 * KHÔNG gửi `tenantId` — backend tự lấy từ membership (CLAUDE.md mục 6, lằn ranh 1).
 *
 * `keepPreviousData` trên mọi query: đổi khoảng/bộ lọc hay refetch nền GIỮ lưới cũ thay vì thay
 * bằng skeleton — người đang đọc lịch không bị giật về trắng, và đây cũng là thứ chặn hiện tượng
 * "đổi ngày nhanh làm lịch nhấp nháy" trên thiết bị mạng chậm.
 *
 * Bốn query dùng CHUNG một tham chiếu `query`, và `sort` CHỈ vào query của resources: đổi thứ tự
 * hàng không có lý do gì bắt events/availability/dấu giá nạp lại.
 */
export function useCalendarData(
  filters: CalendarFilters,
  /**
   * Thiếu `calendar.view` thì KHÔNG gọi API — bốn request chắc chắn nhận 403.
   *
   * Web gọi rồi mới nhận 403 vì hook của nó không có cổng này; thứ người dùng THẤY thì giống hệt
   * (màn từ chối), nên đây là chuyện hạ tầng chứ không phải luật nghiệp vụ. Mọi màn quản lý của
   * app đã theo quy ước này — xem `useBranches(filters, canView)`.
   */
  enabled = true,
): {
  range: CalendarRange;
  resources: ReturnType<typeof useCalendarResources>['data'];
  eventsByResource: ReadonlyMap<string, CalendarEvent[]>;
  priceMarkers: ReadonlyMap<string, PriceMarker>;
  availableByDay: ReadonlyMap<string, number>;
  totalVehicles: number | null;
  hasAnyEvent: boolean;
  isLoading: boolean;
  isFetching: boolean;
  error: unknown;
  refetch: () => void;
} {
  const range = useMemo(() => buildRange(filters.from, filters.days), [filters.from, filters.days]);
  const branchScope = useBranchScopeParams();

  /*
   * `buildRange` trả `Date` — mốc TUYỆT ĐỐI dựng từ ranh giới ngày giờ VN, không phải giá trị một
   * ô chọn; `.toISOString()` ở đây là phép serialize đúng, không phải chỗ cần `appWallClockToIso`.
   *
   * Tham chiếu ổn định theo GIÁ TRỊ: object mới mỗi render sẽ lọt vào `queryKey` và biến mỗi nhịp
   * render thành một cache entry mới — đúng thứ làm cuộn lịch gọi lại API liên tục.
   */
  const query = useMemo(
    () =>
      calendarRangeParams({
        startAt: range.startAt.toISOString(),
        endAt: range.endAt.toISOString(),
        vehicleType: filters.vehicleType,
        q: filters.q,
        branchId: branchScope.branchId,
      }),
    [range.startAt, range.endAt, filters.vehicleType, filters.q, branchScope.branchId],
  );

  const resourceQuery = useMemo(() => ({ ...query, sort: filters.sort }), [query, filters.sort]);

  const resources = useCalendarResources(resourceQuery, enabled);

  const events = useQuery({
    queryKey: queryKeys.calendar.events(query),
    queryFn: () => calendarApi.events(query),
    placeholderData: keepPreviousData,
    enabled,
  });

  const availability = useQuery({
    queryKey: queryKeys.calendar.availability(query),
    queryFn: () => calendarApi.availability(query),
    placeholderData: keepPreviousData,
    enabled,
  });

  const dailyPrices = useQuery({
    queryKey: queryKeys.calendar.dailyPrices(query),
    queryFn: () => calendarApi.dailyPrices(query),
    placeholderData: keepPreviousData,
    enabled,
  });

  /** Gom event theo xe MỘT lần, thay vì mỗi hàng tự lọc cả mảng (O(n²) với 1.000 xe). */
  const eventsByResource = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events.data ?? []) {
      const list = map.get(event.resourceId);
      if (list) list.push(event);
      else map.set(event.resourceId, [event]);
    }
    return map;
  }, [events.data]);

  const priceMarkers = useMemo(() => {
    const map = new Map<string, PriceMarker>();
    for (const row of dailyPrices.data ?? []) {
      map.set(priceMarkerKey(row.vehicleId, row.date), {
        dailyPrice: row.dailyPrice ?? null,
        hourlyPrice: row.hourlyPrice ?? null,
      });
    }
    return map;
  }, [dailyPrices.data]);

  const availableByDay = useMemo(
    () => new Map((availability.data?.days ?? []).map((d) => [d.date, d.availableCount])),
    [availability.data],
  );

  return {
    range,
    resources: resources.data,
    eventsByResource,
    priceMarkers,
    availableByDay,
    totalVehicles: availability.data?.totalVehicles ?? null,
    hasAnyEvent: (events.data?.length ?? 0) > 0,
    /*
     * Tải LẦN ĐẦU (chưa có gì để vẽ) — refetch nền không tính.
     *
     * `isPending`, KHÔNG phải `isLoading`: một query đang TẮT có `isLoading === false` (v5 định
     * nghĩa nó là `isPending && isFetching`). Dùng `isLoading` thì trong lúc chờ quyền về, lưới
     * rơi thẳng vào trạng thái rỗng — người dùng đọc "Chưa có xe nào" cho một gian hàng đầy xe.
     */
    isLoading: resources.isPending || events.isPending,
    isFetching: resources.isFetching || events.isFetching,
    error: resources.error ?? events.error,
    refetch: () => {
      void resources.refetch();
      void events.refetch();
      void availability.refetch();
      void dailyPrices.refetch();
    },
  };
}

function useCalendarResources(resourceQuery: QueryParams, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.calendar.resources(resourceQuery),
    queryFn: () => calendarApi.resources(resourceQuery),
    placeholderData: keepPreviousData,
    enabled,
  });
}
