'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { debtFiltersToParams, fetchDebts } from '../api';
import type { DebtFilters } from '../types';

/** Danh sách công nợ — phân trang server-side, tính động từ bookings. */
export function useDebts(filters: DebtFilters) {
  return useQuery({
    queryKey: queryKeys.debts.list(debtFiltersToParams(filters)),
    queryFn: () => fetchDebts(filters),
    placeholderData: keepPreviousData,
  });
}
