'use client';

import { BOOKING_STATUS_VALUES, DEBT_FILTER_VALUES, DEBT_SORT_VALUES } from '@xeprime/types';
import { enumParam, positiveIntParam, useUrlFilters } from '@/hooks/use-url-filters';
import type { DebtFilters } from '../types';

/**
 * Filter công nợ ở URL searchParams (ADR 0004).
 *
 * Từ 04/11/2026 sống ở tab "Công nợ" của Lịch sử giao dịch (`/receipts?view=debts`) — `view` là
 * tham số của TRANG, không của bộ lọc này, và `useUrlFilters` giữ nguyên nó qua mỗi lần lọc.
 *
 * Giá trị lạ trên URL (link cũ, gõ tay) rơi về mặc định thay vì thành một lỗi 400 cho thứ người
 * dùng không hề gõ.
 */
export function useDebtFilters() {
  return useUrlFilters<DebtFilters>((sp) => ({
    q: sp.get('q') ?? undefined,
    filter: enumParam(sp, 'filter', DEBT_FILTER_VALUES),
    status: enumParam(sp, 'status', BOOKING_STATUS_VALUES),
    sort: enumParam(sp, 'sort', DEBT_SORT_VALUES),
    branchId: sp.get('branchId') ?? undefined,
    page: positiveIntParam(sp, 'page'),
    limit: positiveIntParam(sp, 'limit'),
  }));
}

/**
 * Có filter nào đang bật không — quyết định câu chữ "chưa có nợ" vs "không khớp bộ lọc".
 * Sắp xếp không phải bộ lọc: nó không đổi tập dòng.
 */
export function hasDebtFilters(filters: DebtFilters): boolean {
  return (
    Boolean(filters.q) ||
    Boolean(filters.filter) ||
    Boolean(filters.status) ||
    Boolean(filters.branchId)
  );
}

/**
 * Bộ giá trị "đã xoá hết" — mọi khoá đều phải có mặt, nếu không `setFilters` không đụng tới.
 * `sort` cố ý KHÔNG có ở đây: "Xoá bộ lọc" giữ nguyên thứ tự người dùng đã chọn.
 */
export function clearedDebtFilters(): Partial<DebtFilters> {
  return { q: undefined, filter: undefined, status: undefined, branchId: undefined };
}
