'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import {
  archiveBankAccount,
  createBankAccount,
  fetchBankAccounts,
  setDefaultBankAccount,
} from '../api';
import type { BankAccountScope, SaveBankAccountInput } from '../types';

export function useBankAccounts(scope: BankAccountScope) {
  return useQuery({
    queryKey: queryKeys.bankAccounts.list(scope),
    queryFn: () => fetchBankAccounts(scope),
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
    mutationFn: (body: SaveBankAccountInput) => createBankAccount(scope, body),
    onSuccess: invalidate,
  });
}

export function useSetDefaultBankAccount(scope: BankAccountScope) {
  const invalidate = useInvalidate(scope);
  return useMutation({
    mutationFn: (id: string) => setDefaultBankAccount(scope, id),
    onSuccess: invalidate,
  });
}

export function useArchiveBankAccount(scope: BankAccountScope) {
  const invalidate = useInvalidate(scope);
  return useMutation({
    mutationFn: (id: string) => archiveBankAccount(scope, id),
    onSuccess: invalidate,
  });
}
