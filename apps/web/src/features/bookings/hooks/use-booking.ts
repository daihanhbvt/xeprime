'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { fetchBooking, fetchBookingDriverHistory, fetchDriverWageQuote } from '../api';

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
    queryKey: bookingDriverHistoryKey(id),
    queryFn: () => fetchBookingDriverHistory(id),
    enabled: enabled && id.length > 0,
  });
}

/** Khoá lịch sử tài xế của đơn — dùng chung cho query và mutation sửa tiền công. */
export function bookingDriverHistoryKey(id: string) {
  return [...queryKeys.bookings.detail(id), 'driver-history'] as const;
}

/**
 * Số liệu tiền công cho hộp gán (ADR 0075). Khoá DƯỚI `bookings.detail(id)` để đổi lịch đơn (số
 * ngày đổi) hay đổi mức mặc định rồi làm mới chi tiết đơn cũng làm mới gợi ý.
 */
export function useDriverWageQuote(id: string, enabled: boolean) {
  return useQuery({
    queryKey: [...queryKeys.bookings.detail(id), 'driver-wage-quote'],
    queryFn: () => fetchDriverWageQuote(id),
    enabled: enabled && id.length > 0,
  });
}
