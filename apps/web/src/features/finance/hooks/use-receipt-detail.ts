'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { fetchReceipt } from '../api';

/** Chi tiết một phiếu — chỉ gọi khi drawer thật sự mở (`id` null = không fetch). */
export function useReceiptDetail(id: string | null) {
  return useQuery({
    queryKey: queryKeys.receipts.detail(id ?? ''),
    queryFn: () => fetchReceipt(id!),
    enabled: Boolean(id),
  });
}
