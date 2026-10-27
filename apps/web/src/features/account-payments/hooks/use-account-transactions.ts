'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import {
  accountTransactionParams,
  fetchAccountTransactions,
  type AccountTransactionFilters,
} from '../api';

export function useAccountTransactions(filters: AccountTransactionFilters) {
  const params = accountTransactionParams(filters);
  return useQuery({
    queryKey: queryKeys.accountTransactions.list(params),
    queryFn: () => fetchAccountTransactions(params),
    // Giữ trang cũ trong lúc tải trang/bộ lọc mới — danh sách tiền nhấp nháy trắng là khó đọc.
    placeholderData: keepPreviousData,
  });
}
