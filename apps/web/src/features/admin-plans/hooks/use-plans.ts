'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { fetchPlans, fetchTenantSubscriptions } from '../api';

export function usePlans(status: 'active' | 'all' = 'all') {
  return useQuery({
    queryKey: queryKeys.billing.plans(status),
    queryFn: () => fetchPlans(status),
    placeholderData: keepPreviousData,
  });
}

export function useTenantSubscriptions(tenantId: string | null, page = 1) {
  return useQuery({
    queryKey: queryKeys.billing.subscriptions(tenantId ?? '', page),
    queryFn: () => fetchTenantSubscriptions(tenantId as string, page),
    enabled: Boolean(tenantId),
    placeholderData: keepPreviousData,
  });
}
