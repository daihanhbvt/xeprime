'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { createBooking, transitionBooking, updateBooking } from '../api';
import type { CreateBookingInput, TransitionInput, UpdateBookingInput } from '../types';

/**
 * Sau mỗi mutation, invalidate `bookings` + `calendar` + `dashboard`: tạo/đổi đơn ảnh hưởng
 * cả lịch (occupancy) lẫn số liệu tổng quan, nên mọi danh sách đang mở tự tải lại.
 */
function invalidateAfterBookingChange(queryClient: ReturnType<typeof useQueryClient>): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
}

export function useCreateBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateBookingInput) => createBooking(body),
    onSuccess: () => invalidateAfterBookingChange(queryClient),
  });
}

export function useUpdateBooking(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateBookingInput) => updateBooking(id, body),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.bookings.detail(id), updated);
      invalidateAfterBookingChange(queryClient);
    },
  });
}

export function useTransitionBooking(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: TransitionInput) => transitionBooking(id, body),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.bookings.detail(id), updated);
      invalidateAfterBookingChange(queryClient);
    },
  });
}
