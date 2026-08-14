'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useBranchScopeParams } from '@/features/branches/hooks/use-branch-scope';
import { apiGet } from '@/services/api-client';
import { queryKeys } from '@/services/query-keys';
import type { CalendarEvent, CalendarResource } from '../types/calendar.types';
import { buildRange } from '../utils/calendar-date.util';
import { useCalendarFilters } from './use-calendar-filters';

/**
 * Nạp xe + event cho khoảng đang xem.
 *
 * Không gửi `tenantId` lên — backend tự lấy từ membership (CLAUDE.md mục 6, lằn ranh 1).
 * Nếu thấy chỗ nào thêm tenantId vào query thì đó là bug bảo mật, không phải tính năng.
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

  const resources = useQuery({
    queryKey: queryKeys.calendar.resources(query),
    queryFn: () => apiGet<CalendarResource[]>('/calendar/resources', query),
  });

  const events = useQuery({
    queryKey: queryKeys.calendar.events(query),
    queryFn: () => apiGet<CalendarEvent[]>('/calendar/events', query),
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

  return {
    range,
    filters,
    resources: resources.data ?? [],
    eventsByResource,
    isLoading: resources.isLoading || events.isLoading,
    error: resources.error ?? events.error,
  };
}
