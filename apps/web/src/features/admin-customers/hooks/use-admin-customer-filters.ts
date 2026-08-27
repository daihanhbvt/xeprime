'use client';

import { positiveIntParam, useUrlFilters } from '@/hooks/use-url-filters';
import type { AdminCustomerFilters } from '../types';

/** Filter danh sách khách thuê ở URL searchParams (ADR 0004). */
export function useAdminCustomerFilters() {
  return useUrlFilters<AdminCustomerFilters>((sp) => ({
    q: sp.get('q') ?? undefined,
    phone: sp.get('phone') ?? undefined,
    email: sp.get('email') ?? undefined,
    status: sp.get('status') ?? 'all',
    hasRequests: sp.get('hasRequests') === 'true',
    page: positiveIntParam(sp, 'page'),
    limit: positiveIntParam(sp, 'limit'),
  }));
}
