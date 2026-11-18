'use client';

import { isPlatformTripRequestQueue } from '@xeprime/types';
import { positiveIntParam, useUrlFilters } from '@/hooks/use-url-filters';
import type { TripRequestFilters } from '@/features/admin-trips/types';

/** Trần `limit` của `/platform/trips/requests` (`PLATFORM_TRIP_MAX_LIMIT`) — vượt thì API trả 400. */
const MAX_LIMIT = 100;

/**
 * Bộ lọc tab "Chưa giữ chỗ" ở URL searchParams (ADR 0004). `queue` bỏ trống = cả hai chặng; giá
 * trị lạ trên URL bị bỏ qua thay vì gửi lên để nhận 400.
 */
export function usePendingRequestFilters() {
  return useUrlFilters<TripRequestFilters>((sp) => {
    const queue = sp.get('queue');
    const limit = positiveIntParam(sp, 'limit');
    return {
      queue: isPlatformTripRequestQueue(queue) ? queue : undefined,
      q: sp.get('q')?.trim() || undefined,
      phone: sp.get('phone')?.trim() || undefined,
      page: positiveIntParam(sp, 'page'),
      limit: limit !== undefined && limit <= MAX_LIMIT ? limit : undefined,
    };
  });
}
