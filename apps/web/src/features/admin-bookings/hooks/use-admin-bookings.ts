'use client';

import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import {
  fetchAdminBooking,
  fetchAdminBookings,
  filtersToParams,
  revealBookingContact,
} from '../api';
import type { AdminBookingFilters } from '../types';

export function useAdminBookings(filters: AdminBookingFilters) {
  return useQuery({
    queryKey: ['admin-bookings', filtersToParams(filters)],
    queryFn: () => fetchAdminBookings(filters),
    placeholderData: keepPreviousData,
  });
}

export function useAdminBooking(id: string | null) {
  return useQuery({
    queryKey: ['admin-booking', id],
    queryFn: () => fetchAdminBooking(id as string),
    enabled: Boolean(id),
  });
}

/**
 * Bỏ che SĐT khách của một đơn.
 *
 * Cố tình là MUTATION chứ không phải query: mỗi lần gọi ghi một dòng audit ở backend, nên nó
 * phải do người dùng bấm, không được refetch/retry ngầm như dữ liệu đọc.
 */
export function useRevealBookingContact(id: string) {
  return useMutation({ mutationFn: () => revealBookingContact(id) });
}
