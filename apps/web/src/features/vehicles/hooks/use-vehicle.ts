'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { fetchVehicle } from '../api';

/** Chi tiết một xe. `enabled` để không gọi khi chưa có id (route đang resolve). */
export function useVehicle(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.vehicles.detail(id ?? ''),
    queryFn: () => fetchVehicle(id as string),
    enabled: Boolean(id),
  });
}
