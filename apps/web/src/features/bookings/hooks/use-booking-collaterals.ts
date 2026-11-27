'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import {
  addBookingCollateral,
  removeBookingCollateral,
  setBookingCollateralReturned,
  updateBookingCollateral,
} from '../api';
import type { BookingCollateral, BookingCollateralInput, BookingDetail } from '../types';

/**
 * Sổ tài sản thế chấp của một đơn (ADR 0109). Mỗi thao tác trả về danh sách MỚI của đơn — ghi thẳng
 * vào cache chi tiết đơn thay vì tải lại cả đơn (tiền, lịch, tài xế không đổi theo).
 */
function useCollateralMutation<TVars>(
  bookingId: string,
  fn: (vars: TVars) => Promise<BookingCollateral[]>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (collaterals) => {
      queryClient.setQueryData<BookingDetail>(queryKeys.bookings.detail(bookingId), (prev) =>
        prev ? { ...prev, collaterals } : prev,
      );
    },
  });
}

export const useAddBookingCollateral = (bookingId: string) =>
  useCollateralMutation(bookingId, (body: BookingCollateralInput) =>
    addBookingCollateral(bookingId, body),
  );

export const useRemoveBookingCollateral = (bookingId: string) =>
  useCollateralMutation(bookingId, (collateralId: string) =>
    removeBookingCollateral(bookingId, collateralId),
  );

/** Sửa loại / mô tả một món chưa trả (26/11/2026). */
export const useUpdateBookingCollateral = (bookingId: string) =>
  useCollateralMutation(bookingId, ({ id, body }: { id: string; body: BookingCollateralInput }) =>
    updateBookingCollateral(bookingId, id, body),
  );

export const useSetBookingCollateralReturned = (bookingId: string) =>
  useCollateralMutation(bookingId, ({ id, returned }: { id: string; returned: boolean }) =>
    setBookingCollateralReturned(bookingId, id, returned),
  );
