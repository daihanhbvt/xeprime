'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BOOKING_EXTENSION_STATUS } from '@xeprime/types';
import { queryKeys } from '@/services/query-keys';
import {
  cancelBookingExtension,
  createBookingExtension,
  fetchBookingExtensionQuote,
  fetchBookingExtensions,
} from '../api';
import type { BookingExtension } from '../types';

/**
 * Nhịp hỏi lại khi có phụ lục đang chờ tiền. Phụ lục tự lật `active` lúc webhook SePay đối soát đủ
 * (ADR 0077 điều 5) — màn thanh toán phải tự đổi theo, không có nút "khách đã chuyển khoản".
 */
const AWAITING_REFETCH_MS = 5_000;

/** Phụ lục gia hạn của một đơn (cũ trước). */
export function useBookingExtensions(bookingId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.bookings.extensions(bookingId),
    queryFn: () => fetchBookingExtensions(bookingId),
    enabled,
    refetchInterval: (query) =>
      query.state.data?.some((e) => e.status === BOOKING_EXTENSION_STATUS.AWAITING_PAYMENT)
        ? AWAITING_REFETCH_MS
        : false,
  });
}

/** Phụ lục đang chờ khách thanh toán — tối đa MỘT mỗi đơn (unique ở DB). */
export function pendingExtensionOf(
  extensions: readonly BookingExtension[] | undefined,
): BookingExtension | null {
  return extensions?.find((e) => e.status === BOOKING_EXTENSION_STATUS.AWAITING_PAYMENT) ?? null;
}

/** Xem trước giá + lịch trống của N tháng. Giữ số cũ khi đổi mốc để hộp thoại không nhảy. */
export function useBookingExtensionQuote(bookingId: string, months: number, enabled = true) {
  return useQuery({
    queryKey: queryKeys.bookings.extensionQuote(bookingId, months),
    queryFn: () => fetchBookingExtensionQuote(bookingId, months),
    enabled,
    placeholderData: keepPreviousData,
  });
}

/**
 * Tạo / huỷ phụ lục làm đổi lịch xe và (khi hiệu lực) giờ trả của đơn — làm mới cùng bộ với mọi
 * thao tác trên đơn.
 */
function invalidateAfterExtensionChange(queryClient: ReturnType<typeof useQueryClient>): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
}

export function useCreateBookingExtension(bookingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (months: number) => createBookingExtension(bookingId, months),
    onSuccess: () => invalidateAfterExtensionChange(queryClient),
  });
}

export function useCancelBookingExtension(bookingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (extensionId: string) => cancelBookingExtension(bookingId, extensionId),
    onSuccess: () => invalidateAfterExtensionChange(queryClient),
  });
}
