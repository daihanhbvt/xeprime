'use client';

import { positiveIntParam, useUrlFilters } from '@/hooks/use-url-filters';
import type { DebtFilters } from '../types';

/**
 * Filter công nợ ở URL searchParams (ADR 0004).
 *
 * Dời sang `useUrlFilters` ở Wave 1C-E — hành vi giữ nguyên (chỉ có `filter` và `page`).
 */
export function useDebtFilters() {
  return useUrlFilters<DebtFilters>((sp) => ({
    filter: sp.get('filter') ?? undefined,
    page: positiveIntParam(sp, 'page'),
  }));
}
