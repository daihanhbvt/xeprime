'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { fetchFinanceSummary } from '../api';

/** Tổng quan tài chính theo kỳ (thu/chi/cân đối/công nợ). */
export function useFinanceSummary(from?: string, to?: string) {
  return useQuery({
    queryKey: queryKeys.finance.summary({ from: from ?? null, to: to ?? null }),
    queryFn: () => fetchFinanceSummary(from, to),
  });
}
