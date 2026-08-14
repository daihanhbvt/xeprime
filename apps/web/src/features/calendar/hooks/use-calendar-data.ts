'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useBranchScopeParams } from '@/features/branches/hooks/use-branch-scope';
import { queryKeys } from '@/services/query-keys';
import {
  fetchCalendarAvailability,
  fetchCalendarDailyPrices,
  fetchCalendarEvents,
  fetchCalendarResources,
} from '../api';
import type { CalendarEvent } from '../types/calendar.types';
import { buildRange } from '../utils/calendar-date.util';
import { useCalendarFilters } from './use-calendar-filters';

/** Khoá tra dấu giá riêng của một ô: `vehicleId:YYYY-MM-DD`. */
export function priceMarkerKey(vehicleId: string, date: string): string {
  return `${vehicleId}:${date}`;
}

/**
 * Nạp xe + event + hàng "Xe còn trống" + dấu giá riêng cho khoảng đang xem.
 *
 * Không gửi `tenantId` lên — backend tự lấy từ membership (CLAUDE.md mục 6, lằn ranh 1).
 * Nếu thấy chỗ nào thêm tenantId vào query thì đó là bug bảo mật, không phải tính năng.
 *
 * `keepPreviousData` trên mọi query: đổi khoảng/bộ lọc hay refetch nền GIỮ lưới cũ (mờ nhẹ)
 * thay vì thay bằng skeleton — người đang đọc lịch không bị giật về trắng.
 */
export function useCalendarData() {
  const { filters } = useCalendarFilters();

  const range = useMemo(() => buildRange(filters.from, filters.days), [filters.from, filters.days]);

  const branchScope = useBranchScopeParams();
  const query = {
    startAt: range.startAt.toISOString(),
    endAt: range.endAt.toISOString(),
    ...(filters.vehicleType ? { vehicleType: filters.vehicleType } : {}),
    ...(filters.q ? { q: filters.q } : {}),
    // Bộ chọn chi nhánh ở thanh trên thu hẹp danh sách XE trên lịch (và do đó cả event của
    // chúng). Nằm trong query key nên đổi chi nhánh là lịch tự nạp lại.
    ...branchScope,
  };

  // `sort` CHỈ vào query của resources: đổi thứ tự hàng không có lý do gì bắt events /
  // availability / dấu giá refetch lại (chúng không phụ thuộc thứ tự).
  const resourceQuery = { ...query, sort: filters.sort };
  const resources = useQuery({
    queryKey: queryKeys.calendar.resources(resourceQuery),
    queryFn: () => fetchCalendarResources(resourceQuery),
    placeholderData: keepPreviousData,
  });

  const events = useQuery({
    queryKey: queryKeys.calendar.events(query),
    queryFn: () => fetchCalendarEvents(query),
    placeholderData: keepPreviousData,
  });

  const availability = useQuery({
    queryKey: queryKeys.calendar.availability(query),
    queryFn: () => fetchCalendarAvailability(query),
    placeholderData: keepPreviousData,
  });

  const dailyPrices = useQuery({
    queryKey: queryKeys.calendar.dailyPrices(query),
    queryFn: () => fetchCalendarDailyPrices(query),
    placeholderData: keepPreviousData,
  });

  /** Gom event theo xe một lần, thay vì mỗi hàng tự filter cả mảng (O(n²) với 1.000 xe). */
  const eventsByResource = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events.data ?? []) {
      const list = map.get(event.resourceId);
      if (list) list.push(event);
      else map.set(event.resourceId, [event]);
    }
    return map;
  }, [events.data]);

  /** `vehicleId:date` → có giá riêng — tra O(1) khi vẽ marker từng ô. */
  const priceMarkers = useMemo(() => {
    const map = new Map<string, { dailyPrice: string | null; hourlyPrice: string | null }>();
    for (const row of dailyPrices.data ?? []) {
      map.set(priceMarkerKey(row.vehicleId, row.date), {
        dailyPrice: row.dailyPrice ?? null,
        hourlyPrice: row.hourlyPrice ?? null,
      });
    }
    return map;
  }, [dailyPrices.data]);

  /** `YYYY-MM-DD` → số xe trống — hàng tổng kết đọc theo cột ngày. */
  const availableByDay = useMemo(
    () => new Map((availability.data?.days ?? []).map((d) => [d.date, d.availableCount])),
    [availability.data],
  );

  return {
    range,
    filters,
    resources: resources.data ?? [],
    eventsByResource,
    priceMarkers,
    availableByDay,
    totalVehicles: availability.data?.totalVehicles ?? null,
    /** Tải LẦN ĐẦU (chưa có gì để vẽ) — refetch nền không tính. */
    isLoading: resources.isLoading || events.isLoading,
    /** Refetch nền — lưới giữ nguyên, chỉ mờ nhẹ. */
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
