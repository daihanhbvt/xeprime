'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useBranchScopeParams } from '@/features/branches/hooks/use-branch-scope';
import { queryKeys } from '@/services/query-keys';
import { fetchVehicles, filtersToParams } from '../api';
import type { VehicleFilters } from '../types';

/**
 * Danh sách xe của gian hàng — server data (TanStack Query, ADR 0004). Luôn phân trang server-side.
 * `keepPreviousData` giữ trang cũ trong lúc tải trang mới để bảng không nhấp nháy về rỗng.
 *
 * Bộ chọn chi nhánh ở thanh trên được ghép vào ĐÂY chứ không ở từng màn: `branchId` nằm trong
 * query key nên đổi chi nhánh là tự refetch, và không màn nào quên gửi tham số.
 */
export function useVehicles(filters: VehicleFilters) {
  const branchScope = useBranchScopeParams();
  const params = { ...filtersToParams(filters), ...branchScope };
  return useQuery({
    queryKey: queryKeys.vehicles.list(params),
    queryFn: () => fetchVehicles({ ...filters, ...branchScope }),
    placeholderData: keepPreviousData,
  });
}
