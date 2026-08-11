'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { approveBookingRequest, rejectBookingRequest, saveDeliveryQuote } from '../api';
import type { SaveDeliveryQuoteInput } from '../types';

/**
 * Duyệt yêu cầu tạo Booking (giữ chỗ lịch) → invalidate cả bookings/calendar/dashboard ngoài
 * booking-requests. Từ chối chỉ đổi trạng thái yêu cầu.
 */
export function useApproveBookingRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => approveBookingRequest(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookingRequests.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
    },
  });
}

export function useRejectBookingRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      rejectBookingRequest(id, reason),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.bookingRequests.all }),
  });
}

/** Chốt báo giá giao nhận — mở khoá nút Duyệt cho yêu cầu có giao tận nơi. */
export function useSaveDeliveryQuote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: SaveDeliveryQuoteInput }) =>
      saveDeliveryQuote(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.bookingRequests.all }),
  });
}
