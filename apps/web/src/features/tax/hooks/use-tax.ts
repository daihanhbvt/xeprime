'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import {
  fetchShopTaxSummary,
  fetchTaxPeriodSummary,
  fetchTaxRows,
  markPeriodDeclared,
  markPeriodRemitted,
  reverseTaxRow,
  taxRowFiltersToParams,
} from '../api';
import type { TaxRowFilters } from '../types';

export function useTaxPeriodSummary(period: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.tax.periodSummary(period),
    queryFn: () => fetchTaxPeriodSummary(period),
    enabled,
    // Số liệu kê khai là bằng chứng: không cache một bản cũ để ai đó ký vào tờ khai lỗi thời.
    staleTime: 0,
  });
}

export function useTaxRows(filters: TaxRowFilters, enabled = true) {
  const params = taxRowFiltersToParams(filters);
  return useQuery({
    queryKey: queryKeys.tax.rows(params),
    queryFn: () => fetchTaxRows(params),
    enabled,
    placeholderData: keepPreviousData,
  });
}

/** Thuế của CHÍNH gian hàng — `tenant_id` từ session. */
export function useShopTaxSummary(period: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.tax.shopSummary(period ?? 'current'),
    queryFn: () => fetchShopTaxSummary(period),
    enabled,
  });
}

/**
 * Mọi thao tác thuế làm mới CẢ nhánh `tax` lẫn nhánh `platformMoney`.
 *
 * Nhánh thứ hai không phải phòng xa: `custodied.taxAccrued` của bảng đối soát ba vế đọc chính
 * những dòng này, nên đảo một dòng hay đánh dấu một kỳ đã nộp là đổi con số ở màn đối soát.
 */
function useInvalidateTax() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.tax.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.platformMoney.all });
  };
}

export function useMarkPeriodDeclared() {
  const invalidate = useInvalidateTax();
  return useMutation({
    mutationFn: (period: string) => markPeriodDeclared(period),
    onSuccess: invalidate,
  });
}

export function useMarkPeriodRemitted() {
  const invalidate = useInvalidateTax();
  return useMutation({
    mutationFn: (period: string) => markPeriodRemitted(period),
    onSuccess: invalidate,
  });
}

export function useReverseTaxRow() {
  const invalidate = useInvalidateTax();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => reverseTaxRow(id, { reason }),
    onSuccess: invalidate,
  });
}
