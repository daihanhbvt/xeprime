'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { fetchPaymentHistory, recordPayment, voidPayment } from '../api';
import type { RecordPaymentInput } from '../types';

/** Thu tiền/hoàn tiền ảnh hưởng đơn + công nợ + dashboard + lịch sử → invalidate hết. */
function invalidateAfterPayment(
  queryClient: ReturnType<typeof useQueryClient>,
  bookingId: string,
): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.debts.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.finance.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.receipts.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.payments.history(bookingId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
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

export function useVoidPayment(bookingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (paymentId: string) => voidPayment(paymentId),
    onSuccess: () => invalidateAfterPayment(queryClient, bookingId),
  });
}
