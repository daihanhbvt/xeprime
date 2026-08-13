'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { createBooking, transitionBooking, updateBooking, updateBookingDeliveryFee } from '../api';
import type {
  CreateBookingInput,
  TransitionInput,
  UpdateBookingInput,
  UpdateDeliveryFeeInput,
} from '../types';

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

/**
 * Chốt phí giao nhận của đơn (Wave 9). Tổng tiền do SERVER tính lại nên response là nguồn duy
 * nhất — ghi thẳng vào cache detail thay vì tự cộng ở client.
 */
export function useUpdateBookingDeliveryFee(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateDeliveryFeeInput) => updateBookingDeliveryFee(id, body),
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

/**
 * Đổi khung giờ đơn từ lịch (kéo/resize). `id` truyền lúc gọi (không cố định theo hook) vì
 * mỗi thanh event trên lịch là một đơn khác nhau. Backend reschedule occupancy trong
 * transaction; trùng lịch → 409 (ADR 0006), người gọi tự bắt lỗi.
 */
export function useRescheduleBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, pickupAt, returnAt }: { id: string; pickupAt: string; returnAt: string }) =>
      updateBooking(id, { pickupAt, returnAt }),
    onSuccess: () => invalidateAfterBookingChange(queryClient),
  });
}
