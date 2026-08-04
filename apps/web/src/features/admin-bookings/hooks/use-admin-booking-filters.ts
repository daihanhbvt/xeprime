'use client';

import { BOOKING_DATE_FIELD } from '@xeprime/types';
import { positiveIntParam, useUrlFilters } from '@/hooks/use-url-filters';
import type { AdminBookingFilters } from '../types';

/** Filter danh sách đơn thuê toàn hệ thống ở URL searchParams (ADR 0004). */
export function useAdminBookingFilters() {
  return useUrlFilters<AdminBookingFilters>((sp) => ({
    q: sp.get('q') ?? undefined,
    phone: sp.get('phone') ?? undefined,
    tenantId: sp.get('tenantId') ?? undefined,
    vehicleId: sp.get('vehicleId') ?? undefined,
    status: sp.get('status') ?? 'all',
    dateField: sp.get('dateField') ?? BOOKING_DATE_FIELD.CREATED_AT,
    dateFrom: sp.get('dateFrom') ?? undefined,
    dateTo: sp.get('dateTo') ?? undefined,
    page: positiveIntParam(sp, 'page'),
    limit: positiveIntParam(sp, 'limit'),
  }));
}
