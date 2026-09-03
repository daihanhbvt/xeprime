'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { fetchBookings, filtersToParams } from '@/features/bookings/api';
import type { BookingFilters } from '@/features/bookings/types';
import { nowInAppTz } from '@/lib/datetime';

const RECENT_LIMIT = 6;
const PANEL_LIMIT = 6;

/**
 * Số liệu & danh sách đơn cho dashboard. Mốc thời gian tính MỘT lần lúc mount (useMemo []) để
 * query key không đổi mỗi render — tránh refetch vô hạn. Mỗi ô là một truy vấn `/bookings`
 * có phân trang, không kéo cả bảng.
 */
export function useDashboardBookings() {
  const bounds = useMemo(() => {
    // "Hết hôm nay" / "3 ngày tới" là ranh giới NGÀY VIỆT NAM, không phải ngày của máy đang
    // mở dashboard — nếu không, cùng một đơn lúc thì nằm trong ô "trả hôm nay" lúc thì không.
    const now = nowInAppTz();
    return {
      now: now.toISOString(),
      endToday: now.endOf('day').toISOString(),
      in3days: now.add(3, 'day').endOf('day').toISOString(),
    };
  }, []);

  const useList = (filters: BookingFilters) =>
    useQuery({
      queryKey: queryKeys.bookings.list(filtersToParams(filters)),
      queryFn: () => fetchBookings(filters),
      staleTime: 60_000,
    });

  const recent = useList({ sort: 'newest', limit: RECENT_LIMIT });
  const dueToday = useList({
    status: 'active',
    returnTo: bounds.endToday,
    sort: 'return_asc',
    limit: PANEL_LIMIT,
  });
  const upcoming = useList({
    status: 'active',
    returnFrom: bounds.endToday,
    returnTo: bounds.in3days,
    sort: 'return_asc',
    limit: PANEL_LIMIT,
  });
  const active = useList({ status: 'active', limit: 1 });
  const overdue = useList({ status: 'active', returnTo: bounds.now, limit: 1 });

  return {
    recent,
    dueToday,
    upcoming,
    activeCount: active.data?.meta.total,
    overdueCount: overdue.data?.meta.total,
  };
}
