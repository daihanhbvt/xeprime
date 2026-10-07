'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { createBankAccount, fetchBankAccounts } from '../api';
import type { BankAccount, BankAccountScope, SaveBankAccountInput } from '../types';

/**
 * Tài khoản nhận tiền của chủ — mảng 0 hoặc 1 phần tử (mỗi chủ một tài khoản, database bảo đảm).
 * Giữ hình mảng vì đó là hợp đồng của API; người đọc lấy bằng `currentBankAccount`.
 */
export function useBankAccounts(scope: BankAccountScope) {
  return useQuery({
    queryKey: queryKeys.bankAccounts.list(scope),
    queryFn: () => fetchBankAccounts(scope),
  });
}

/**
 * Thêm hoặc ĐỔI tài khoản nhận tiền. Server trả đúng tài khoản đang dùng sau thao tác, nên danh
 * sách mới CHÍNH LÀ `[account]` — ghi thẳng vào cache để mọi nơi đang mở (khối trên trang, hộp
 * thoại rút tiền) đổi ngay, rồi vẫn làm mới để khớp server. Không ghi thì có một nhịp hộp thoại
 * rút còn cầm id tài khoản vừa bị lưu trữ, và lệnh rút gửi đúng lúc đó nhận 404.
 */
export function useCreateBankAccount(scope: BankAccountScope) {
  const queryClient = useQueryClient();
  const key = queryKeys.bankAccounts.list(scope);
  return useMutation({
    mutationFn: (body: SaveBankAccountInput) => createBankAccount(scope, body),
    onSuccess: (account) => {
      queryClient.setQueryData<BankAccount[]>(key, [account]);
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });
}
