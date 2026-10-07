'use client';

import { positiveIntParam, useUrlFilters } from '@/hooks/use-url-filters';
import type { TripQueueFilters } from '../types';

/** Trần `limit` của `/platform/trips/*` (`PLATFORM_TRIP_MAX_LIMIT`) — vượt thì API trả 400. */
const MAX_LIMIT = 100;

/** Tham số URL của đơn đang mở ở panel chi tiết (hai hàng đợi "trong chuyến"). */
export const TRIP_OPEN_PARAM = 'open';

export interface TripQueueUrlState extends TripQueueFilters {
  open?: string;
}

/**
 * Bộ lọc + trang + đơn đang mở của hàng đợi ĐANG CHỌN — ở URL cạnh `?queue=`. `useTripQueue` xoá
 * chúng khi đổi hàng đợi, nên ở đây không phải nhớ hàng đợi nào.
 */
export function useTripQueueFilters() {
  return useUrlFilters<TripQueueUrlState>((sp) => {
    const limit = positiveIntParam(sp, 'limit');
    return {
      q: sp.get('q')?.trim() || undefined,
      tenantId: sp.get('tenantId')?.trim() || undefined,
      page: positiveIntParam(sp, 'page'),
      limit: limit !== undefined && limit <= MAX_LIMIT ? limit : undefined,
      open: sp.get(TRIP_OPEN_PARAM)?.trim() || undefined,
    };
  });
}
