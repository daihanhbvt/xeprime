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
 * Mọi thao tác đều đụng tới cờ `isDefault` của CÁC dòng khác, nên phải làm mới cả danh sách chứ
 * không sửa một dòng trong cache: thêm một tài khoản mặc định làm dòng cũ thôi mặc định, và bỏ
 * một dòng làm dòng khác lên thay.
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

export function useSetDefaultBankAccount(scope: BankAccountScope) {
  const invalidate = useInvalidate(scope);
  return useMutation({
    mutationFn: (id: string) => bankAccountsApi.setDefault(scope, id),
    onSuccess: invalidate,
  });
}

export function useArchiveBankAccount(scope: BankAccountScope) {
  const invalidate = useInvalidate(scope);
  return useMutation({
    mutationFn: (id: string) => bankAccountsApi.archive(scope, id),
    onSuccess: invalidate,
  });
}
