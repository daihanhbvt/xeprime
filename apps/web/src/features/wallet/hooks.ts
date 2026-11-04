'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { isNegativeMoney, subtractMoney } from '@xeprime/domain';
import { WALLET_STATUS } from '@xeprime/types';
import { useAppFormat } from '@/i18n/use-app-format';
import { queryKeys } from '@/services/query-keys';
import {
  cancelWithdrawal,
  createWithdrawal,
  fetchWalletActivity,
  fetchWalletStatement,
  fetchWalletSummary,
  fetchWithdrawals,
  walletActivityParams,
  walletStatementParams,
} from './api';
import type {
  CreateWithdrawalInput,
  WalletActivityFilters,
  WalletScope,
  WalletStatementFilters,
} from './types';

/**
 * `enabled: false` khi tài khoản này KHÔNG có ví (nhân viên gian hàng — `walletScopeFor` trả
 * `null`): gọi thử rồi nhận 403 là một lỗi đỏ trên màn của người không làm gì sai.
 */
export function useWalletSummary(scope: WalletScope, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.wallet.summary(scope),
    queryFn: () => fetchWalletSummary(scope),
    enabled: options.enabled ?? true,
  });
}

export function useWithdrawals(scope: WalletScope, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.wallet.withdrawals(scope),
    queryFn: () => fetchWithdrawals(scope),
    enabled: options.enabled ?? true,
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
    // Lệnh rút là một dòng của "Lịch sử giao dịch" phía khách.
    if (scope === 'account') {
      void queryClient.invalidateQueries({ queryKey: queryKeys.accountTransactions.all });
    }
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

export function useWalletActivity(filters: WalletActivityFilters, enabled: boolean) {
  const params = walletActivityParams(filters);
  return useQuery({
    queryKey: queryKeys.wallet.activity('shop', params),
    queryFn: () => fetchWalletActivity(params),
    enabled,
    placeholderData: keepPreviousData,
  });
}

/**
 * Rút được hay chưa, và vì sao chưa — quy tắc sống ở MỘT nơi cho cả hai trang số dư (khu khách,
 * trang Quản lý ví của partner).
 *
 * Nút vẫn HIỆN khi chưa đủ điều kiện rút, chỉ bị khoá: ẩn nó đi thì người dùng không biết chức năng
 * tồn tại, còn dòng gợi ý nói rõ vì sao chưa bấm được. Ví đóng băng thì thẻ số dư đã có cảnh báo
 * riêng — `hint` để trống, không nói hai lần. So trên CHUỖI tiền, không qua `Number` (ADR 0007).
 */
export function useWithdrawGate(scope: WalletScope): { canWithdraw: boolean; hint: string | null } {
  const t = useTranslations('Wallet');
  const fmt = useAppFormat();
  const { data: balance } = useWalletSummary(scope);
  const canWithdraw =
    balance !== undefined &&
    balance.status !== WALLET_STATUS.FROZEN &&
    !isNegativeMoney(subtractMoney(balance.available, balance.minWithdrawAmount));
  const hint =
    balance && !canWithdraw && balance.status !== WALLET_STATUS.FROZEN
      ? t('withdraw.belowMinimum', { min: fmt.money(balance.minWithdrawAmount) })
      : null;
  return { canWithdraw, hint };
}
