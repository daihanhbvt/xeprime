'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import {
  approveBookingRequest,
  rejectBookingRequest,
  startBookingRequestConversation,
} from '../api';
import type { ApproveBookingRequestInput } from '../types';

/**
 * Duyệt yêu cầu tạo Booking (giữ chỗ lịch) → invalidate cả bookings/calendar/dashboard ngoài
 * booking-requests. Từ chối chỉ đổi trạng thái yêu cầu.
 *
 * Wave 9: KHÔNG còn bước báo giá giao nhận trước khi duyệt — yêu cầu có giao tận nơi duyệt
 * được ngay và đơn sinh ra với phí `0đ`.
 */
export function useApproveBookingRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body?: ApproveBookingRequestInput }) =>
      approveBookingRequest(id, body),
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
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      rejectBookingRequest(id, reason),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.bookingRequests.all }),
  });
}

/**
 * Gian hàng mở hội thoại với khách của một yêu cầu.
 *
 * Idempotent ở backend (mở lại đúng thread cũ), nên không cần optimistic gì; chỉ làm mới danh
 * sách hội thoại + badge chưa đọc để khu tin nhắn hiện ngay thread vừa mở.
 */
export function useStartBookingRequestConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => startBookingRequestConversation(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.chat.conversations() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.chat.unreadCount() });
    },
  });
}
