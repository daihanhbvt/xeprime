'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { fetchLiveSubscriptions, fetchPlans, fetchTenantSubscriptions } from '../api';

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

/** Chuỗi kỳ còn hạn của gian hàng — `null` thì không gọi (người thiếu quyền quản lý gói). */
export function useLiveSubscriptions(tenantId: string | null) {
  return useQuery({
    queryKey: queryKeys.billing.liveSubscriptions(tenantId ?? ''),
    queryFn: () => fetchLiveSubscriptions(tenantId as string),
    enabled: Boolean(tenantId),
  });
}
