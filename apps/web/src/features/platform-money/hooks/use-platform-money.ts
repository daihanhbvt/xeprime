'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import {
  approveWithdrawal,
  fetchDailyReconciliation,
  fetchHolds,
  fetchInsuranceQueue,
  insuranceFiltersToParams,
  fetchRefunds,
  fetchWithdrawalQueue,
  holdFiltersToParams,
  markRefundPaid,
  markWithdrawalPaid,
  refundFiltersToParams,
  rejectRefund,
  rejectWithdrawal,
  retryInsurance,
  reverseWithdrawal,
  saveBankBalance,
  settleHold,
  voidInsurance,
  withdrawalFiltersToParams,
} from '../api';
import type {
  HoldFilters,
  MarkRefundPaidInput,
  RefundFilters,
  RejectRefundInput,
  SaveBankBalanceInput,
  SettleHoldInput,
  MarkWithdrawalPaidInput,
  WithdrawalFilters,
  InsuranceFilters,
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
 * Nhập số dư ngân hàng cuối ngày.
 *
 * Nạp thẳng kết quả vào cache của ĐÚNG ngày vừa nhập: response đã là bản đối soát tính lại với
 * số dư mới, nên fetch lại một lần nữa chỉ để thấy cùng con số là một vòng chờ thừa ngay lúc
 * người dùng đang nhìn một chênh lệch và muốn biết nó biến mất chưa.
 */
export function useSaveBankBalance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SaveBankBalanceInput) => saveBankBalance(body),
    onSuccess: (recon, body) => {
      queryClient.setQueryData(queryKeys.platformMoney.reconciliation(body.date), recon);
    },
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

// ── Hàng đợi bảo hiểm (ADR 0032 điều 4 — Phase 7) ───────────────────────────

export function useInsuranceQueue(filters: InsuranceFilters) {
  const params = insuranceFiltersToParams(filters);
  return useQuery({
    queryKey: queryKeys.platformInsurance.list(params),
    queryFn: () => fetchInsuranceQueue(params),
    placeholderData: keepPreviousData,
  });
}

/**
 * Thử lại / thu hồi đều đổi trạng thái một dòng VÀ con số `insuranceReserved` của bảng đối soát
 * — nên làm mới cả nhánh money, không chỉ nhánh bảo hiểm.
 */
function useInvalidateInsurance() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.platformInsurance.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.platformMoney.all });
  };
}

export function useRetryInsurance() {
  const invalidate = useInvalidateInsurance();
  return useMutation({ mutationFn: (id: string) => retryInsurance(id), onSuccess: invalidate });
}

export function useVoidInsurance() {
  const invalidate = useInvalidateInsurance();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => voidInsurance(id, { reason }),
    onSuccess: invalidate,
  });
}
