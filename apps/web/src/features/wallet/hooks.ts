'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import {
  cancelWithdrawal,
  createWithdrawal,
  fetchWalletEntries,
  fetchWalletStatement,
  fetchWalletSummary,
  fetchWithdrawals,
  walletEntriesParams,
  walletStatementParams,
} from './api';
import type { CreateWithdrawalInput, WalletScope, WalletStatementFilters } from './types';

export function useWalletSummary(scope: WalletScope) {
  return useQuery({
    queryKey: queryKeys.wallet.summary(scope),
    queryFn: () => fetchWalletSummary(scope),
  });
}

export function useWalletEntries(scope: WalletScope, page: number) {
  const params = walletEntriesParams(page);
  return useQuery({
    queryKey: queryKeys.wallet.entries(scope, params),
    queryFn: () => fetchWalletEntries(scope, params),
    // Giữ trang cũ trong lúc tải trang mới — sổ tiền nhấp nháy trắng mỗi lần lật là khó đọc.
    placeholderData: keepPreviousData,
  });
}

export function useWithdrawals(scope: WalletScope) {
  return useQuery({
    queryKey: queryKeys.wallet.withdrawals(scope),
    queryFn: () => fetchWithdrawals(scope),
  });
}

/**
 * Mọi thao tác rút đều đụng CẢ BA thứ: số dư, sổ, và danh sách lệnh. Làm mới cả nhánh `wallet`
 * của scope đó thay vì vá từng cache — một con số lệch giữa ba chỗ trên cùng màn hình là lý do
 * người dùng không tin vào số dư nữa.
 */
function useInvalidateWallet(scope: WalletScope) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.wallet.summary(scope) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.wallet.withdrawals(scope) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.wallet.all });
  };
}

export function useCreateWithdrawal(scope: WalletScope) {
  const invalidate = useInvalidateWallet(scope);
  return useMutation({
    mutationFn: (body: CreateWithdrawalInput) => createWithdrawal(scope, body),
    onSuccess: invalidate,
  });
}

export function useCancelWithdrawal(scope: WalletScope) {
  const invalidate = useInvalidateWallet(scope);
  return useMutation({
    mutationFn: (id: string) => cancelWithdrawal(scope, id),
    onSuccess: invalidate,
  });
}

/**
 * Bảng tổng hợp giao dịch của gian hàng theo kỳ.
 *
 * `placeholderData` giữ bảng cũ trong lúc đổi tháng hoặc lật trang: một bảng tiền nhấp nháy về
 * trắng rồi hiện lại là cách nhanh nhất để người đọc tưởng số liệu vừa biến mất.
 *
 * `enabled` để màn ví phía KHÁCH (`scope === 'account'`) không gọi một endpoint chỉ dành cho
 * gian hàng rồi nhận 403.
 */
export function useWalletStatement(filters: WalletStatementFilters, enabled: boolean) {
  const params = walletStatementParams(filters);
  return useQuery({
    queryKey: queryKeys.wallet.statement('shop', params),
    queryFn: () => fetchWalletStatement(params),
    enabled,
    placeholderData: keepPreviousData,
  });
}
