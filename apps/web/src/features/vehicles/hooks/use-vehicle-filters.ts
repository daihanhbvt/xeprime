'use client';

import { enumParam, positiveIntParam, useUrlFilters } from '@/hooks/use-url-filters';
import { VEHICLE_LIST_VIEW_VALUES } from '../constants';
import type { VehicleFilters, VehicleListView, VehicleSort } from '../types';

/**
 * Filter danh sách xe ở URL searchParams — ADR 0004.
 *
 * Dời sang `useUrlFilters` ở Wave 1C-E. Hành vi giữ nguyên: trang không bao giờ truyền `'all'`
 * hay `false` xuống (thanh lọc dùng `allowClear` trả `undefined`), nên hai nhánh xoá thêm của
 * hook chung không đổi kết quả nào.
 *
 * `view` (lưới / danh sách) cũng sống ở đây để F5 và link chia sẻ giữ đúng kiểu xem; đổi nó thì
 * gọi `setFilters({ view }, { resetPage: false })` — đổi cách vẽ không phải đổi tập dữ liệu.
 */
export function useVehicleFilters() {
  return useUrlFilters<VehicleFilters>((sp) => ({
    q: sp.get('q') ?? undefined,
    vehicleType: sp.get('vehicleType') ?? undefined,
    branchId: sp.get('branchId') ?? undefined,
    serviceType: sp.get('serviceType') ?? undefined,
    operationStatus: sp.get('operationStatus') ?? undefined,
    publicStatus: sp.get('publicStatus') ?? undefined,
    sort: (sp.get('sort') as VehicleSort | null) ?? undefined,
    view: enumParam(sp, 'view', VEHICLE_LIST_VIEW_VALUES) as VehicleListView | undefined,
    page: positiveIntParam(sp, 'page'),
    limit: positiveIntParam(sp, 'limit'),
  }));
}
