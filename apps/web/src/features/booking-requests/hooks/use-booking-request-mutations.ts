'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import {
  approveBookingRequest,
  cancelBookingRequest,
  rejectBookingRequest,
  startBookingRequestConversation,
} from '../api';
import type { ApproveBookingRequestInput, CancelBookingRequestInput } from '../types';

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
 * HUỶ một chuyến đã nhận — làm mới đúng những thứ mà lượt DUYỆT đã đụng vào.
 *
 * Lượt duyệt chiếm lịch, sinh khoản giữ chỗ và đổi số liệu bảng điều khiển; huỷ gỡ lại đúng
 * từng thứ đó, nên nó phải dọn cùng bốn nhánh cache. Chỉ invalidate `bookingRequests` sẽ để
 * lại một vệt bận trên lịch cho một chiếc xe đã rảnh — và người trực sẽ từ chối khách tiếp
 * theo vì tin vào vệt bận đó.
 */
export function useCancelBookingRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: CancelBookingRequestInput }) =>
      cancelBookingRequest(id, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookingRequests.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
    },
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
      // Tiền tố `chat` phủ cả hai bề mặt: thread vừa mở nằm ở inbox gian hàng, nhưng cùng tài
      // khoản đó có thể đang mở hộp thư khách ở tab khác.
      void queryClient.invalidateQueries({ queryKey: queryKeys.chat.all });
    },
  });
}
