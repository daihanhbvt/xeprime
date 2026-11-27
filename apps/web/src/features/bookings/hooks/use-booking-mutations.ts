'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import {
  assignBookingDriver,
  createBooking,
  setHandoverPrepCheck,
  transitionBooking,
  updateBooking,
  updateBookingDeliveryFee,
  updateBookingSource,
  updateDriverWage,
} from '../api';
import type {
  AssignBookingDriverInput,
  BookingDetail,
  CreateBookingInput,
  SetHandoverPrepCheckInput,
  TransitionInput,
  UpdateBookingInput,
  UpdateBookingSourceInput,
  UpdateDeliveryFeeInput,
  UpdateDriverWageInput,
} from '../types';
import { bookingDriverHistoryKey } from './use-booking';

/**
 * Sau mỗi mutation, invalidate `bookings` + `calendar` + `dashboard` + `customers` + `vehicles`: tạo/đổi đơn
 * ảnh hưởng cả lịch (occupancy), số liệu tổng quan lẫn sổ khách (lượt thuê, đơn hiện tại, còn nợ),
 * nên mọi danh sách đang mở tự tải lại.
 */
function invalidateAfterBookingChange(queryClient: ReturnType<typeof useQueryClient>): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
  // Thẻ ở Danh sách xe: trạng thái vận hành, "Chuyến đã đi", KM sau bàn giao, doanh thu theo xe.
  void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
}

/**
 * Response của các lượt sửa đơn là `toDetail` THUẦN - không kèm `handoverPrep` /
 * `customerCompletedRentals` (chỉ `GET /bookings/:id` dựng hai phần đó). Ghi đè thẳng vào cache làm
 * thẻ "Chuẩn bị bàn giao" biến mất rồi hiện lại khi refetch xong (nháy). Giữ phần cũ tới khi
 * refetch (do `invalidateAfterBookingChange` kích) mang số mới về.
 */
function keepDetailExtras(prev: BookingDetail | undefined, next: BookingDetail): BookingDetail {
  if (!prev) return next;
  return {
    ...next,
    handoverPrep: next.handoverPrep ?? prev.handoverPrep,
    customerCompletedRentals: next.customerCompletedRentals ?? prev.customerCompletedRentals,
  };
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
      queryClient.setQueryData<BookingDetail>(queryKeys.bookings.detail(id), (prev) =>
        keepDetailExtras(prev, updated),
      );
      invalidateAfterBookingChange(queryClient);
    },
  });
}

/** Đổi nguồn của một đơn tự lập (ADR 0110) - response là đơn đã cập nhật. */
export function useUpdateBookingSource(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateBookingSourceInput) => updateBookingSource(id, body),
    onSuccess: (updated) => {
      queryClient.setQueryData<BookingDetail>(queryKeys.bookings.detail(id), (prev) =>
        keepDetailExtras(prev, updated),
      );
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
      queryClient.setQueryData<BookingDetail>(queryKeys.bookings.detail(id), (prev) =>
        keepDetailExtras(prev, updated),
      );
      invalidateAfterBookingChange(queryClient);
    },
  });
}

/**
 * Gán/bỏ gán tài xế liên kết, hoặc ghi tài xế ngoài hệ thống (ADR 0067) — response là đơn đã cập
 * nhật, ghi thẳng vào cache detail.
 */
export function useAssignBookingDriver(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: AssignBookingDriverInput) => assignBookingDriver(id, body),
    onSuccess: (updated) => {
      queryClient.setQueryData<BookingDetail>(queryKeys.bookings.detail(id), (prev) =>
        keepDetailExtras(prev, updated),
      );
      invalidateAfterBookingChange(queryClient);
      // Số "đơn đang gán" trên trang Tài xế đổi theo.
      void queryClient.invalidateQueries({ queryKey: queryKeys.drivers.all });
    },
  });
}

/**
 * Sửa tiền công của một lượt gán (ADR 0075). Response là lịch sử tài xế mới — ghi thẳng vào cache;
 * thống kê tháng ở trang Tài xế đổi theo. Không động tới cache tiền của đơn: tiền công không phải
 * một dòng tiền của đơn.
 */
export function useUpdateDriverWage(bookingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ assignmentId, body }: { assignmentId: string; body: UpdateDriverWageInput }) =>
      updateDriverWage(bookingId, assignmentId, body),
    onSuccess: (history) => {
      queryClient.setQueryData(bookingDriverHistoryKey(bookingId), history);
      void queryClient.invalidateQueries({ queryKey: queryKeys.drivers.all });
    },
  });
}

export function useTransitionBooking(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: TransitionInput) => transitionBooking(id, body),
    onSuccess: (updated) => {
      queryClient.setQueryData<BookingDetail>(queryKeys.bookings.detail(id), (prev) =>
        keepDetailExtras(prev, updated),
      );
      invalidateAfterBookingChange(queryClient);
    },
  });
}

/**
 * Đánh dấu tay một việc chuẩn bị bàn giao (03/11/2026). Response là khối checklist mới — vá thẳng
 * vào cache chi tiết đơn, không tải lại cả đơn cho một dấu tick.
 */
export function useSetHandoverPrepCheck(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SetHandoverPrepCheckInput) => setHandoverPrepCheck(id, body),
    onSuccess: (handoverPrep) => {
      queryClient.setQueryData<BookingDetail>(queryKeys.bookings.detail(id), (current) =>
        current ? { ...current, handoverPrep } : current,
      );
    },
  });
}
