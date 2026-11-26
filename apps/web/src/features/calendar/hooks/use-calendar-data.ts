'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { queryKeys } from '@/services/query-keys';
import { fetchCalendarDailyPrices, fetchCalendarEvents, fetchCalendarResources } from '../api';
import type { CalendarEvent, CalendarResource } from '../types/calendar.types';
import { buildRange } from '../utils/calendar-date.util';
import { useCalendarFilters } from './use-calendar-filters';

/**
 * Mảng rỗng DÙNG CHUNG khi chưa có dữ liệu: `data ?? []` đẻ một mảng mới mỗi lần render, và mọi
 * `useMemo` phía sau (bố cục hàng của lưới) sẽ tính lại vô tận.
 */
const NO_RESOURCES: CalendarResource[] = [];

/** Khoá tra dấu giá riêng của một ô: `vehicleId:YYYY-MM-DD`. */
export function priceMarkerKey(vehicleId: string, date: string): string {
  return `${vehicleId}:${date}`;
}

/**
 * Nạp xe + event (kèm yêu cầu chờ duyệt) + dấu giá riêng cho khoảng đang xem.
 *
 * Không gửi `tenantId` lên — backend tự lấy từ membership (CLAUDE.md mục 6, lằn ranh 1).
 * Nếu thấy chỗ nào thêm tenantId vào query thì đó là bug bảo mật, không phải tính năng.
 *
 * `keepPreviousData` trên mọi query: đổi khoảng/bộ lọc hay refetch nền GIỮ lưới cũ (mờ nhẹ)
 * thay vì thay bằng skeleton — người đang đọc lịch không bị giật về trắng.
 *
 * Hàng "Xe còn trống" cũ đã gỡ khỏi lưới (thiết kế lại 25/11/2026, người dùng chốt) — endpoint
 * `/calendar/availability` vẫn sống cho app native.
 */
export function useCalendarData() {
  const { filters } = useCalendarFilters();
  const range = useMemo(() => buildRange(filters.from, filters.days), [filters.from, filters.days]);

  const query = {
    // `buildRange` trả `Date` — mốc TUYỆT ĐỐI dựng từ ranh giới ngày giờ VN, không phải giá trị
    // ô chọn; `.toISOString()` ở đây là phép serialize đúng, không phải chỗ cần `appWallClockToIso`.
    startAt: range.startAt.toISOString(),
    endAt: range.endAt.toISOString(),
    ...(filters.vehicleType ? { vehicleType: filters.vehicleType } : {}),
    ...(filters.q ? { q: filters.q } : {}),
    // Ô "Chi nhánh" trên thanh công cụ thu hẹp danh sách XE của lịch — và do đó cả event, ô
    // trống và dấu giá của chúng. Nằm trong query key nên đổi chi nhánh là lịch tự nạp lại.
    ...(filters.branchId ? { branchId: filters.branchId } : {}),
  };

  // `sort` CHỈ vào query của resources: đổi thứ tự hàng không có lý do gì bắt events / dấu giá
  // refetch lại (chúng không phụ thuộc thứ tự).
  const resourceQuery = { ...query, sort: filters.sort };
  const resources = useQuery({
    queryKey: queryKeys.calendar.resources(resourceQuery),
    queryFn: () => fetchCalendarResources(resourceQuery),
    placeholderData: keepPreviousData,
  });

  /*
   * Lưới vẽ cả yêu cầu CHỜ DUYỆT (nhóm "Cần xử lý" - người dùng chốt 25/11/2026). Chúng không chiếm
   * lịch (`occupying = false`); server chỉ trả khi người xem có quyền xem yêu cầu.
   */
  const eventQuery = { ...query, includePendingRequests: true };
  const events = useQuery({
    queryKey: queryKeys.calendar.events(eventQuery),
    queryFn: () => fetchCalendarEvents(eventQuery),
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

  /** `vehicleId:date` → có giá riêng — tra O(1) khi tô ô. */
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

  return {
    range,
    filters,
    resources: resources.data ?? NO_RESOURCES,
    eventsByResource,
    priceMarkers,
    /** Tải LẦN ĐẦU (chưa có gì để vẽ) — refetch nền không tính. */
    isLoading: resources.isLoading || events.isLoading,
    /** Refetch nền — lưới giữ nguyên, chỉ mờ nhẹ. */
    isFetching: resources.isFetching || events.isFetching,
    error: resources.error ?? events.error,
    refetch: () => {
      void resources.refetch();
      void events.refetch();
      void dailyPrices.refetch();
    },
  };
}
