'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { fetchBooking, updateBooking } from '@/features/bookings/api';
import type { BookingDetail } from '@/features/bookings/types';
import { adjustDepositCollected, fetchPaymentHistory, recordPayment, voidPayment } from '../api';
import type { RecordPaymentInput } from '../types';

/**
 * Thu tiền/hoàn tiền ảnh hưởng đơn + công nợ + dashboard + lịch sử → invalidate hết. Sổ khách
 * cũng vậy: "Còn nợ", "Đã thu", đơn hiện tại và tab Thu chi của hồ sơ khách đều suy từ tiền đơn.
 */
export function invalidateAfterPayment(
  queryClient: ReturnType<typeof useQueryClient>,
  bookingId: string,
): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.debts.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.finance.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.receipts.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.payments.history(bookingId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
  // Thu tiền sinh phiếu thu theo xe — "Tổng doanh thu" trên thẻ ở Danh sách xe đọc từ đó.
  void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
}

export function usePaymentHistory(bookingId: string | null) {
  return useQuery({
    queryKey: queryKeys.payments.history(bookingId ?? ''),
    queryFn: () => fetchPaymentHistory(bookingId!),
    enabled: Boolean(bookingId),
  });
}

export function useRecordPayment(bookingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: RecordPaymentInput) => recordPayment(bookingId, body),
    onSuccess: () => invalidateAfterPayment(queryClient, bookingId),
  });
}

export type SaveDepositEditInput = {
  /** Mức cọc phải thu mới - `null` = không đổi. */
  depositAmount: string | null;
  /** Số đã thu mới - `null` = không đổi. */
  collectedAmount: string | null;
};

export class DepositRequiredSavedError extends Error {
  constructor(override readonly cause: unknown) {
    super('deposit required saved, adjustment failed');
  }
}

/**
 * Hộp "Sửa tiền cọc": mức phải thu (PATCH đơn) + số đã thu (phiếu điều chỉnh) trong MỘT lượt
 * mutation. Chỉ ghi cache chi tiết đơn MỘT lần với bản cuối cùng (có `handoverPrep` mới) rồi mới
 * invalidate - ghi từng bước làm thẻ "Chuẩn bị bàn giao" nhảy qua 2-3 trạng thái trung gian.
 */
export function useSaveDepositEdit(bookingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveDepositEditInput): Promise<BookingDetail> => {
      if (input.depositAmount !== null) {
        await updateBooking(bookingId, { depositAmount: input.depositAmount });
      }
      if (input.collectedAmount !== null) {
        try {
          return await adjustDepositCollected(bookingId, { collectedAmount: input.collectedAmount });
        } catch (err) {
          if (input.depositAmount !== null) throw new DepositRequiredSavedError(err);
          throw err;
        }
      }
      // PATCH không trả `handoverPrep` - đọc lại bản đủ để ghi cache một lần.
      return fetchBooking(bookingId);
    },
    onSuccess: (detail) => {
      queryClient.setQueryData<BookingDetail>(queryKeys.bookings.detail(bookingId), detail);
      invalidateAfterPayment(queryClient, bookingId);
    },
    onError: (err) => {
      // Mức cọc đã lưu dù số đã thu lỗi - đồng bộ lại để hộp hiện đúng số đang lưu.
      if (err instanceof DepositRequiredSavedError) invalidateAfterPayment(queryClient, bookingId);
    },
  });
}

export function useVoidPayment(bookingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (paymentId: string) => voidPayment(paymentId),
    onSuccess: () => invalidateAfterPayment(queryClient, bookingId),
  });
}
