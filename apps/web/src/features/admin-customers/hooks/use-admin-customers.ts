'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import {
  fetchAdminCustomer,
  fetchAdminCustomers,
  filtersToParams,
  fetchCustomerLicenceImage,
  fetchCustomerLicences,
  lockCustomer,
  revealCustomerContact,
  unlockCustomer,
} from '../api';
import type { AdminCustomerFilters } from '../types';

export function useAdminCustomers(filters: AdminCustomerFilters) {
  return useQuery({
    queryKey: ['admin-customers', filtersToParams(filters)],
    queryFn: () => fetchAdminCustomers(filters),
    placeholderData: keepPreviousData,
  });
}

export function useAdminCustomer(id: string | null) {
  return useQuery({
    queryKey: ['admin-customer', id],
    queryFn: () => fetchAdminCustomer(id as string),
    enabled: Boolean(id),
  });
}

/**
 * Bỏ che SĐT/email của một khách. Là MUTATION chứ không phải query vì mỗi lần gọi ghi một
 * dòng audit ở backend — phải do người dùng bấm, không refetch/retry ngầm.
 */
export function useRevealCustomerContact(id: string) {
  return useMutation({ mutationFn: () => revealCustomerContact(id) });
}

/**
 * Khoá / mở khoá tài khoản khách. Server trả chi tiết MỚI — ghi thẳng vào cache chi tiết, rồi làm
 * mới danh sách (bộ lọc "Đã khoá" đổi số).
 */
export function useSetCustomerLock(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ lock, reason }: { lock: boolean; reason: string }) =>
      lock ? lockCustomer(id, reason) : unlockCustomer(id, reason),
    onSuccess: (detail) => {
      queryClient.setQueryData(['admin-customer', id], detail);
      void queryClient.invalidateQueries({ queryKey: ['admin-customers'] });
    },
  });
}

/** `enabled` = người xem có quyền xem bằng lái — không có thì không gọi để khỏi nhận 403. */
export function useCustomerLicences(userId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.platformDriverLicences.byCustomer(userId),
    queryFn: () => fetchCustomerLicences(userId),
    enabled,
  });
}

/**
 * Ảnh bằng lái — URL sống 120 giây ở server; giữ ngắn hơn và KHÔNG tự làm mới khi cửa sổ lấy lại
 * focus: mỗi lượt xin URL là một dòng audit, không nên sinh ra vì người xem chuyển tab.
 */
export function useCustomerLicenceImage(id: string | null) {
  return useQuery({
    queryKey: queryKeys.platformDriverLicences.image(id ?? ''),
    queryFn: () => fetchCustomerLicenceImage(id as string),
    enabled: Boolean(id),
    staleTime: 90_000,
    gcTime: 100_000,
    refetchOnWindowFocus: false,
  });
}
