import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/queries/query-keys';
import {
  walletApi,
  walletEntriesParams,
  walletStatementParams,
  WALLET_SCOPE,
  type CreateWithdrawalInput,
  type WalletScope,
  type WalletStatementFilters,
} from '@/api/wallet/api';

/**
 * Ví điểm — bản native của `features/wallet/hooks.ts` bên web. Cùng khoá cache, cùng luật làm mới.
 *
 * ADR 0033: đây là SỔ CÔNG NỢ XePrime phải trả, không phải ví điện tử — không nạp, không chuyển
 * ngang, không thanh toán nội bộ. Mọi hook ở đây chỉ ĐỌC sổ và mở/huỷ một lệnh rút.
 */
export function useWalletSummary(scope: WalletScope, enabled = true) {
  return useQuery({
    queryKey: queryKeys.wallet.summary(scope),
    queryFn: () => walletApi.summary(scope),
    enabled,
  });
}

export function useWalletEntries(scope: WalletScope, page: number, enabled = true) {
  const params = walletEntriesParams(page);
  return useQuery({
    queryKey: queryKeys.wallet.entries(scope, params),
    queryFn: () => walletApi.entries(scope, params),
    // Giữ trang cũ trong lúc tải trang mới — sổ tiền nhấp nháy trắng mỗi lần lật là khó đọc.
    placeholderData: keepPreviousData,
    enabled,
  });
}

/**
 * Bảng tổng hợp giao dịch của gian hàng theo kỳ.
 *
 * `placeholderData` giữ bảng cũ trong lúc đổi tháng hoặc lật trang: một bảng tiền nhấp nháy về
 * trắng rồi hiện lại là cách nhanh nhất để người đọc tưởng số liệu vừa biến mất.
 *
 * `enabled` để màn ví phía KHÁCH (`scope === 'account'`) không gọi một endpoint chỉ dành cho gian
 * hàng rồi nhận 403.
 */
export function useWalletStatement(filters: WalletStatementFilters, enabled: boolean) {
  const params = walletStatementParams(filters);
  return useQuery({
    queryKey: queryKeys.wallet.statement(WALLET_SCOPE.SHOP, params),
    queryFn: () => walletApi.statement(params),
    enabled,
    placeholderData: keepPreviousData,
  });
}

export function useWithdrawals(scope: WalletScope, enabled = true) {
  return useQuery({
    queryKey: queryKeys.wallet.withdrawals(scope),
    queryFn: () => walletApi.withdrawals(scope),
    enabled,
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
    mutationFn: (body: CreateWithdrawalInput) => walletApi.createWithdrawal(scope, body),
    onSuccess: invalidate,
  });
}

export function useCancelWithdrawal(scope: WalletScope) {
  const invalidate = useInvalidateWallet(scope);
  return useMutation({
    mutationFn: (id: string) => walletApi.cancelWithdrawal(scope, id),
    onSuccess: invalidate,
  });
}
