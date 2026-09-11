'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import {
  approveWithdrawal,
  fetchDailyReconciliation,
  fetchHolds,
  fetchRefunds,
  fetchWithdrawalQueue,
  holdFiltersToParams,
  markRefundPaid,
  markWithdrawalPaid,
  refundFiltersToParams,
  rejectRefund,
  rejectWithdrawal,
  reverseWithdrawal,
  settleHold,
  withdrawalFiltersToParams,
} from '../api';
import type {
  HoldFilters,
  MarkRefundPaidInput,
  RefundFilters,
  RejectRefundInput,
  SettleHoldInput,
  MarkWithdrawalPaidInput,
  WithdrawalFilters,
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

// ── Hàng đợi rút tiền (ADR 0033 — Phase 5) ──────────────────────────────────

export function useWithdrawalQueue(filters: WithdrawalFilters) {
  const params = withdrawalFiltersToParams(filters);
  return useQuery({
    queryKey: queryKeys.platformWithdrawals.list(params),
    queryFn: () => fetchWithdrawalQueue(params),
    // Giữ trang cũ trong lúc tải trang mới — hàng đợi việc tay nhấp nháy trắng là khó thao tác.
    placeholderData: keepPreviousData,
  });
}

/**
 * Mọi hành động đều đổi trạng thái một dòng VÀ số lệnh quá hạn ở đầu màn, nên làm mới cả nhánh
 * thay vì vá một dòng trong cache. Ví của chủ sở hữu cũng đổi (số dư, sổ) — nhưng đó là cache
 * của người khác, admin không giữ nó.
 */
function useInvalidateQueue() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: queryKeys.platformWithdrawals.all });
}

export function useApproveWithdrawal() {
  const invalidate = useInvalidateQueue();
  return useMutation({ mutationFn: (id: string) => approveWithdrawal(id), onSuccess: invalidate });
}

export function useMarkWithdrawalPaid() {
  const invalidate = useInvalidateQueue();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: MarkWithdrawalPaidInput }) =>
      markWithdrawalPaid(id, body),
    onSuccess: invalidate,
  });
}

export function useRejectWithdrawal() {
  const invalidate = useInvalidateQueue();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      rejectWithdrawal(id, { reason }),
    onSuccess: invalidate,
  });
}

export function useReverseWithdrawal() {
  const invalidate = useInvalidateQueue();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      reverseWithdrawal(id, { reason }),
    onSuccess: invalidate,
  });
}
