'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import {
  fetchBankTransaction,
  fetchBankTransactions,
  filtersToParams,
  ignoreBankTransaction,
  matchBankTransaction,
} from '../api';
import type {
  BankTransactionFilters,
  IgnoreBankTransactionInput,
  MatchBankTransactionInput,
} from '../types';

export function useBankTransactions(filters: BankTransactionFilters) {
  return useQuery({
    queryKey: queryKeys.bankTransactions.list(filtersToParams(filters)),
    queryFn: () => fetchBankTransactions(filters),
    placeholderData: keepPreviousData,
  });
}

/**
 * Chi tiết một giao dịch — `enabled` theo id vì drawer chỉ mở khi có dòng được chọn.
 *
 * `staleTime: 0`: gợi ý là danh sách hoá đơn ĐANG CHỜ, và nó đổi mỗi khi một gian hàng mua gói
 * hoặc một khoản khác được khớp. Cache một danh sách gợi ý cũ là mời admin khớp vào hoá đơn vừa
 * được trả xong.
 */
export function useBankTransaction(id: string | null) {
  return useQuery({
    queryKey: queryKeys.bankTransactions.detail(id ?? ''),
    queryFn: () => fetchBankTransaction(id!),
    enabled: Boolean(id),
    staleTime: 0,
  });
}

/**
 * Khớp tay / bỏ qua đều invalidate CẢ nhánh giao dịch lẫn nhánh subscription: một lần khớp có
 * thể vừa đóng hoá đơn vừa mở gói, nên hai màn đó phải cùng làm mới.
 */
function useInvalidateAfterHandling() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.bankTransactions.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.subscription.all });
  };
}

export function useMatchBankTransaction() {
  const invalidate = useInvalidateAfterHandling();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & MatchBankTransactionInput) =>
      matchBankTransaction(id, body),
    onSuccess: invalidate,
  });
}

export function useIgnoreBankTransaction() {
  const invalidate = useInvalidateAfterHandling();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & IgnoreBankTransactionInput) =>
      ignoreBankTransaction(id, body),
    onSuccess: invalidate,
  });
}
