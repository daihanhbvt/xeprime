'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchAdminTenant,
  fetchAdminTenants,
  filtersToParams,
  lockTenant,
  unlockTenant,
} from '../api';
import { adminPartnerKeys } from '../partner-detail/hooks';
import type { AdminTenantFilters } from '../types';

/**
 * Khoá cache của đối tác ở Platform Admin — MỘT chỗ khai, vì feature khác cũng phải làm mới nó:
 * gán/huỷ gói (`admin-plans`) có thể chuyển một gian hàng từ danh sách này sang danh sách kia.
 */
export const adminTenantQueryKeys = {
  /** Mọi trang của CẢ HAI danh sách đối tác. */
  lists: ['admin-tenants'] as const,
  list: (filters: AdminTenantFilters) => ['admin-tenants', filtersToParams(filters)] as const,
  detail: (id: string | null) => ['admin-tenant', id] as const,
};

export function useAdminTenants(filters: AdminTenantFilters) {
  return useQuery({
    queryKey: adminTenantQueryKeys.list(filters),
    queryFn: () => fetchAdminTenants(filters),
    placeholderData: keepPreviousData,
  });
}

export function useAdminTenant(id: string | null) {
  return useQuery({
    queryKey: adminTenantQueryKeys.detail(id),
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
      queryClient.setQueryData(adminTenantQueryKeys.detail(id), detail);
      void queryClient.invalidateQueries({ queryKey: adminTenantQueryKeys.lists });
      // Đầu drawer chi tiết đối tác hiện trạng thái — không được giữ "Đang hoạt động" sau khi khoá.
      void queryClient.invalidateQueries({ queryKey: adminPartnerKeys.tenant(id) });
    },
  });
}
