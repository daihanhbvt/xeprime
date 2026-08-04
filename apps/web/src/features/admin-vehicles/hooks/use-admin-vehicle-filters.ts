'use client';

import { positiveIntParam, useUrlFilters } from '@/hooks/use-url-filters';
import type { AdminVehicleFilters } from '../types';

/** Filter danh sách xe toàn hệ thống ở URL searchParams (ADR 0004). Mặc định xem tất cả. */
export function useAdminVehicleFilters() {
  return useUrlFilters<AdminVehicleFilters>((sp) => ({
    q: sp.get('q') ?? undefined,
    tenantId: sp.get('tenantId') ?? undefined,
    publicStatus: sp.get('publicStatus') ?? 'all',
    operationStatus: sp.get('operationStatus') ?? 'all',
    vehicleType: sp.get('vehicleType') ?? 'all',
    tenantStatus: sp.get('tenantStatus') ?? 'all',
    page: positiveIntParam(sp, 'page'),
    limit: positiveIntParam(sp, 'limit'),
  }));
}
