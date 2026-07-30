'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchAdminTenant,
  fetchAdminTenants,
  filtersToParams,
  lockTenant,
  unlockTenant,
} from '../api';
import type { AdminTenantFilters } from '../types';

export function useAdminTenants(filters: AdminTenantFilters) {
  return useQuery({
    queryKey: ['admin-tenants', filtersToParams(filters)],
    queryFn: () => fetchAdminTenants(filters),
    placeholderData: keepPreviousData,
  });
}

export function useAdminTenant(id: string | null) {
  return useQuery({
    queryKey: ['admin-tenant', id],
    queryFn: () => fetchAdminTenant(id as string),
    enabled: Boolean(id),
  });
}

/** Khoá / mở khoá gian hàng. Sau khi xong cập nhật chi tiết + làm mới danh sách. */
export function useTenantActions(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, reason }: { kind: 'lock' | 'unlock'; reason?: string }) =>
      kind === 'lock' ? lockTenant(id, reason) : unlockTenant(id),
    onSuccess: (detail) => {
      queryClient.setQueryData(['admin-tenant', id], detail);
      void queryClient.invalidateQueries({ queryKey: ['admin-tenants'] });
    },
  });
}
