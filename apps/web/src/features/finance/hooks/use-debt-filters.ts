'use client';

import { positiveIntParam, useUrlFilters } from '@/hooks/use-url-filters';
import type { DebtFilters } from '../types';

/**
 * Filter công nợ ở URL searchParams (ADR 0004).
 *
 * Dời sang `useUrlFilters` ở Wave 1C-E; ô tìm kiếm (`q`) thêm sau — cùng một hợp đồng, nên
 * chia sẻ URL vẫn mang theo cả từ khoá lẫn nhóm hạn.
 */
export function useDebtFilters() {
  return useUrlFilters<DebtFilters>((sp) => ({
    q: sp.get('q') ?? undefined,
    filter: sp.get('filter') ?? undefined,
    page: positiveIntParam(sp, 'page'),
  }));
}

/** Có filter nào đang bật không — quyết định câu chữ "chưa có nợ" vs "không khớp bộ lọc". */
export function hasDebtFilters(filters: DebtFilters): boolean {
  return Boolean(filters.q) || Boolean(filters.filter);
}

/** Bộ giá trị "đã xoá hết" — mọi khoá đều phải có mặt, nếu không `setFilters` không đụng tới. */
export function clearedDebtFilters(): Partial<DebtFilters> {
  return { q: undefined, filter: undefined };
}
