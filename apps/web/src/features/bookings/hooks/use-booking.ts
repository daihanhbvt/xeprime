'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { fetchBooking, fetchBookingDriverHistory } from '../api';

/** Chi tiết một đơn — chỉ fetch khi có `id` (drawer mở). */
export function useBooking(id: string | null) {
  return useQuery({
    queryKey: queryKeys.bookings.detail(id ?? ''),
    queryFn: () => fetchBooking(id as string),
    enabled: Boolean(id),
  });
}

/**
 * Lịch sử gán tài xế của đơn (ADR 0063). Khoá nằm DƯỚI `bookings.detail(id)` nên mọi lượt làm
 * mới chi tiết đơn (gán, tài xế nhận/từ chối qua thông báo realtime) cũng làm mới lịch sử.
 */
export function useBookingDriverHistory(id: string, enabled: boolean) {
  return useQuery({
    queryKey: [...queryKeys.bookings.detail(id), 'driver-history'],
    queryFn: () => fetchBookingDriverHistory(id),
    enabled: enabled && id.length > 0,
  });
}
