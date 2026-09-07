'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import {
  fetchDailyReconciliation,
  fetchHolds,
  fetchRefunds,
  holdFiltersToParams,
  markRefundPaid,
  refundFiltersToParams,
  rejectRefund,
  settleHold,
} from '../api';
import type {
  HoldFilters,
  MarkRefundPaidInput,
  RefundFilters,
  RejectRefundInput,
  SettleHoldInput,
} from '../types';

export function useHolds(filters: HoldFilters) {
  return useQuery({
    queryKey: queryKeys.platformMoney.holds(holdFiltersToParams(filters)),
    queryFn: () => fetchHolds(filters),
    placeholderData: keepPreviousData,
  });
}

export function useRefunds(filters: RefundFilters) {
  return useQuery({
    queryKey: queryKeys.platformMoney.refunds(refundFiltersToParams(filters)),
    queryFn: () => fetchRefunds(filters),
    placeholderData: keepPreviousData,
  });
}

/**
 * Đối chiếu MỘT ngày. `staleTime: 0` — con số này là bằng chứng kế toán, và nó đổi mỗi lần một
 * khoản tiền về hoặc một khoản hoàn được chuyển. Cache một bản cũ ở đây là mời admin ký vào một
 * bảng đối chiếu đã lỗi thời.
 */
export function useDailyReconciliation(date: string) {
  return useQuery({
    queryKey: queryKeys.platformMoney.reconciliation(date),
    queryFn: () => fetchDailyReconciliation(date),
    staleTime: 0,
  });
}

/**
 * Mọi thao tác tiền invalidate CẢ nhánh money lẫn nhánh giao dịch ngân hàng: chốt một hold hay
 * chuyển một khoản hoàn đều đổi con số của bảng đối chiếu ngày.
 */
function useInvalidateMoney() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.platformMoney.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.bankTransactions.all });
  };
}

export function useSettleHold() {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & SettleHoldInput) => settleHold(id, body),
    onSuccess: invalidate,
  });
}

export function useMarkRefundPaid() {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & MarkRefundPaidInput) => markRefundPaid(id, body),
    onSuccess: invalidate,
  });
}

export function useRejectRefund() {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & RejectRefundInput) => rejectRefund(id, body),
    onSuccess: invalidate,
  });
}
