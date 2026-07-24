'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { fetchBooking } from '../api';

/** Chi tiết một đơn — chỉ fetch khi có `id` (drawer mở). */
export function useBooking(id: string | null) {
  return useQuery({
    queryKey: queryKeys.bookings.detail(id ?? ''),
    queryFn: () => fetchBooking(id as string),
    enabled: Boolean(id),
  });
}
