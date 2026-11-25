import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/queries/query-keys';
import {
  bankAccountsApi,
  type BankAccountScope,
  type CreateBankAccountChangeRequestInput,
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

/*
 * Yêu cầu ĐỔI tài khoản nhận tiền (biên bản họp 19/11/2026, web `use-bank-accounts`): tài khoản khoá
 * sau lần khai đầu (`BANK_ACCOUNT_LOCKED`), đổi phải qua yêu cầu để XePrime gọi xác minh chính chủ.
 */
const changeRequestKey = (scope: BankAccountScope) =>
  [...queryKeys.bankAccounts.list(scope), 'change-request'] as const;

export function useCurrentChangeRequest(scope: BankAccountScope, enabled = true) {
  return useQuery({
    queryKey: changeRequestKey(scope),
    queryFn: () => bankAccountsApi.currentChangeRequest(scope),
    enabled,
  });
}

export function useCreateChangeRequest(scope: BankAccountScope) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateBankAccountChangeRequestInput) =>
      bankAccountsApi.createChangeRequest(scope, body),
    onSuccess: (request) => queryClient.setQueryData(changeRequestKey(scope), request),
  });
}

export function useCancelChangeRequest(scope: BankAccountScope) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => bankAccountsApi.cancelChangeRequest(scope, id),
    onSuccess: () => queryClient.setQueryData(changeRequestKey(scope), null),
  });
}
