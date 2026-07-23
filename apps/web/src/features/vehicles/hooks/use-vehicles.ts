'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { fetchVehicles, filtersToParams } from '../api';
import type { VehicleFilters } from '../types';

/**
 * Danh sách xe của gian hàng — server data (TanStack Query, ADR 0004). Luôn phân trang server-side.
 * `keepPreviousData` giữ trang cũ trong lúc tải trang mới để bảng không nhấp nháy về rỗng.
 */
export function useVehicles(filters: VehicleFilters) {
  return useQuery({
    queryKey: queryKeys.vehicles.list(filtersToParams(filters)),
    queryFn: () => fetchVehicles(filters),
    placeholderData: keepPreviousData,
  });
}
