'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { fetchReceipts, filtersToParams } from '../api';
import type { ReceiptFilters } from '../types';

/** Danh sách phiếu thu/chi — phân trang server-side; giữ trang cũ khi tải trang mới. */
export function useReceipts(filters: ReceiptFilters) {
  return useQuery({
    queryKey: queryKeys.receipts.list(filtersToParams(filters)),
    queryFn: () => fetchReceipts(filters),
    placeholderData: keepPreviousData,
  });
}
