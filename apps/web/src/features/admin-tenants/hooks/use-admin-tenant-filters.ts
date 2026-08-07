'use client';

import { positiveIntParam, useUrlFilters } from '@/hooks/use-url-filters';
import type { AdminTenantFilters } from '../types';

/**
 * Filter danh sách gian hàng ở URL searchParams (ADR 0004). Mặc định xem tất cả.
 *
 * Dời sang `useUrlFilters` ở Wave 1C-D. **Một thay đổi thấy được**: bản copy cũ chỉ xoá
 * `undefined`/`null`/`''`, nên chọn "Tất cả" để lại `?status=all` trong URL. Hook chung coi
 * `'all'` là sentinel không-lọc và xoá hẳn — link sạch hơn, và đồng nhất với 12 danh sách còn
 * lại. Đã nêu trong test đặc tả của trang.
 */
export function useAdminTenantFilters() {
  return useUrlFilters<AdminTenantFilters>((sp) => ({
    status: sp.get('status') ?? 'all',
    q: sp.get('q') ?? undefined,
    page: positiveIntParam(sp, 'page'),
  }));
}
