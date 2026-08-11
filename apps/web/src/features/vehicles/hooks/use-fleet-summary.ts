'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { fetchFleetSummary } from '../api';

/**
 * Đếm đội xe theo trạng thái vận hành — dải chỉ số đầu `/manage/vehicles` (Figma `236:4648`).
 *
 * `enabled` do trang quyết (chỉ tải khi dải chỉ số thực sự hiển thị); hỏng thì dải tự ẩn,
 * không chặn danh sách.
 */
export function useFleetSummary(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.vehicles.fleetSummary(),
    queryFn: fetchFleetSummary,
    enabled,
    staleTime: 60_000,
  });
}
