'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { fetchVehicleStats, type VehicleStats } from '../api';

/** Số liệu xe cho dashboard. Tenant scope do backend tự lấy từ cookie (CLAUDE.md mục 6). */
export function useVehicleStats(): UseQueryResult<VehicleStats> {
  return useQuery({
    queryKey: ['dashboard', 'vehicle-stats'],
    queryFn: fetchVehicleStats,
    staleTime: 60_000,
  });
}
