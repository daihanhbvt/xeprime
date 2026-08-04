'use client';

import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import {
  fetchAdminCustomer,
  fetchAdminCustomers,
  filtersToParams,
  revealCustomerContact,
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
