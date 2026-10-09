import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/queries/query-keys';
import {
  bankAccountsApi,
  type BankAccountScope,
  type SaveBankAccountInput,
} from '@/api/bank-accounts/api';

/** Bản native của `features/bank-accounts/hooks/use-bank-accounts.ts` — cùng khoá, cùng luật. */
export function useBankAccounts(scope: BankAccountScope, enabled = true) {
  return useQuery({
    queryKey: queryKeys.bankAccounts.list(scope),
    queryFn: () => bankAccountsApi.list(scope),
    enabled,
  });
}

/**
 * Thêm/đổi/bỏ đều đụng tới TÀI KHOẢN KHÁC (đổi = lưu trữ cái cũ), nên làm mới cả danh sách chứ
 * không sửa một dòng trong cache. `setDefault` không còn hook: server đã bỏ nghĩa (PR #159).
 */
function useInvalidate(scope: BankAccountScope) {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: queryKeys.bankAccounts.list(scope) });
}

export function useCreateBankAccount(scope: BankAccountScope) {
  const invalidate = useInvalidate(scope);
  return useMutation({
    mutationFn: (body: SaveBankAccountInput) => bankAccountsApi.create(scope, body),
    onSuccess: invalidate,
  });
}
