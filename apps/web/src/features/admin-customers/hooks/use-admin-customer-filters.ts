'use client';

import { CUSTOMER_LICENCE_STATE_VALUES } from '@xeprime/types';
import { ALL_FILTER } from '@/constants/filters';
import { enumParam, positiveIntParam, useUrlFilters } from '@/hooks/use-url-filters';
import type { AdminCustomerFilters } from '../types';

/** Filter danh sách khách thuê ở URL searchParams (ADR 0004). */
export function useAdminCustomerFilters() {
  return useUrlFilters<AdminCustomerFilters>((sp) => ({
    q: sp.get('q') ?? undefined,
    phone: sp.get('phone') ?? undefined,
    email: sp.get('email') ?? undefined,
    status: sp.get('status') ?? ALL_FILTER,
    hasRequests: sp.get('hasRequests') === 'true',
    licence: enumParam(sp, 'licence', CUSTOMER_LICENCE_STATE_VALUES) ?? ALL_FILTER,
    page: positiveIntParam(sp, 'page'),
    limit: positiveIntParam(sp, 'limit'),
  }));
}
