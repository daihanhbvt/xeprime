'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { accountPaymentParams, fetchAccountPayments, type AccountPaymentFilters } from '../api';

export function useAccountPayments(filters: AccountPaymentFilters) {
  const params = accountPaymentParams(filters);
  return useQuery({
    queryKey: queryKeys.accountPayments.list(params),
    queryFn: () => fetchAccountPayments(params),
    // Giữ trang cũ trong lúc tải trang mới — danh sách nhấp nháy trắng khi bấm sang trang là khó đọc.
    placeholderData: keepPreviousData,
  });
}
