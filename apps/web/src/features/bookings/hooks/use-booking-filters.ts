'use client';

import { positiveIntParam, useUrlFilters } from '@/hooks/use-url-filters';
import type { BookingFilters, BookingSort } from '../types';

/**
 * Filter danh sách đơn ở URL searchParams — ADR 0004.
 *
 * Dời sang `useUrlFilters` ở Wave 1C-E. Hành vi giữ nguyên: trang tự quy `'all'` → `undefined`
 * trước khi gọi `setFilters`, nên nhánh xoá `'all'` của hook chung không đổi kết quả nào.
 */
export function useBookingFilters() {
  return useUrlFilters<BookingFilters>((sp) => ({
    q: sp.get('q') ?? undefined,
    status: sp.get('status') ?? undefined,
    vehicleId: sp.get('vehicleId') ?? undefined,
    sort: (sp.get('sort') as BookingSort | null) ?? undefined,
    page: positiveIntParam(sp, 'page'),
    limit: positiveIntParam(sp, 'limit'),
  }));
}
