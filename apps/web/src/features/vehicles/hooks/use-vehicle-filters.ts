'use client';

import { positiveIntParam, useUrlFilters } from '@/hooks/use-url-filters';
import type { VehicleFilters, VehicleSort } from '../types';

/**
 * Filter danh sách xe ở URL searchParams — ADR 0004.
 *
 * Dời sang `useUrlFilters` ở Wave 1C-E. Hành vi giữ nguyên: trang không bao giờ truyền `'all'`
 * hay `false` xuống (thanh lọc dùng `allowClear` trả `undefined`), nên hai nhánh xoá thêm của
 * hook chung không đổi kết quả nào.
 */
export function useVehicleFilters() {
  return useUrlFilters<VehicleFilters>((sp) => ({
    q: sp.get('q') ?? undefined,
    vehicleType: sp.get('vehicleType') ?? undefined,
    serviceType: sp.get('serviceType') ?? undefined,
    operationStatus: sp.get('operationStatus') ?? undefined,
    publicStatus: sp.get('publicStatus') ?? undefined,
    sort: (sp.get('sort') as VehicleSort | null) ?? undefined,
    page: positiveIntParam(sp, 'page'),
    limit: positiveIntParam(sp, 'limit'),
  }));
}
