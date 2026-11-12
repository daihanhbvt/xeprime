'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { debtFiltersToParams, debtScopeToParams, fetchDebtSummary, fetchDebts } from '../api';
import type { DebtFilters } from '../types';

/** Danh sách công nợ — phân trang server-side, tính động từ bookings. */
export function useDebts(filters: DebtFilters, enabled = true) {
  return useQuery({
    queryKey: queryKeys.debts.list(debtFiltersToParams(filters)),
    queryFn: () => fetchDebts(filters),
    placeholderData: keepPreviousData,
    enabled,
  });
}

/**
 * Dải thẻ + số đếm chip của công nợ. Khoá chỉ mang PHẠM VI (tìm · chi nhánh · trạng thái) — đổi
 * nhóm hạn hay sang trang không gọi lại nó. `enabled` để màn Thu chi chỉ hỏi khi có quyền xem.
 */
export function useDebtSummary(filters: DebtFilters, enabled = true) {
  return useQuery({
    queryKey: queryKeys.debts.summary(debtScopeToParams(filters)),
    queryFn: () => fetchDebtSummary(filters),
    placeholderData: keepPreviousData,
    enabled,
  });
}
