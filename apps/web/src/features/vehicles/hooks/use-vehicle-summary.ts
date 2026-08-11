'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { fetchVehicleSummary } from '../api';

/**
 * Tổng hợp Hồ sơ 360 của một xe (chỉ số + đơn thuê theo quyền).
 *
 * Tách khỏi `useVehicle` có chủ đích: phần tổng hợp chậm hơn bản ghi xe, và hỏng cũng không
 * được kéo sập cả trang chi tiết — trang vẫn hiển thị hồ sơ, chỉ khối chỉ số báo lỗi riêng.
 */
export function useVehicleSummary(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.vehicles.summary(id ?? ''),
    queryFn: () => fetchVehicleSummary(id as string),
    enabled: Boolean(id),
    staleTime: 60_000,
  });
}
