'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { fetchVehicleStats } from '../api';
import type { VehicleStats } from '../types';

/**
 * Chỉ số của các xe đang hiện trên trang — **chỉ id của trang hiện tại**, không kéo cả đội xe.
 *
 * Query key ôm danh sách id đã sắp xếp: đổi trang hoặc đổi bộ lọc là một cache entry khác, còn
 * quay lại trang cũ thì dùng lại cache thay vì gọi lại.
 *
 * Hỏng thì trả map rỗng — thẻ xe vẫn dùng được, chỉ mất phần số liệu (yêu cầu "partial metric
 * failure" của Wave 3B).
 */
export function useVehicleCardStats(ids: string[]) {
  const key = [...ids].sort();

  const query = useQuery({
    queryKey: queryKeys.vehicles.stats(key),
    queryFn: () => fetchVehicleStats(key),
    enabled: key.length > 0,
    staleTime: 60_000,
  });

  const byId = new Map<string, VehicleStats>();
  for (const row of query.data ?? []) byId.set(row.vehicleId, row);

  return {
    byId,
    isLoading: query.isLoading && key.length > 0,
    isError: query.isError,
  };
}
