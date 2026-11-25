'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import {
  archiveInternalDriver,
  createInternalDriver,
  fetchAssignableInternalDrivers,
  fetchInternalDriverDetail,
  fetchInternalDriverTrips,
  restoreInternalDriver,
  tripFiltersToParams,
  updateInternalDriver,
} from '../api';
import type {
  CreateInternalDriverInput,
  DriverTripFilters,
  UpdateInternalDriverInput,
} from '../types';

/** Bộ chọn tài xế nội bộ của đơn — server trả cả người bận (không nói bận ở đơn nào). */
export function useAssignableInternalDrivers(
  window: { pickupAt: string; returnAt: string; excludeBookingId?: string },
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.drivers.internalAssignable(window),
    queryFn: () => fetchAssignableInternalDrivers(window),
    enabled,
    staleTime: 30_000,
  });
}

/** Trang chi tiết một tài xế nội bộ (ADR 0108): hồ sơ + đơn đang gán. */
export function useInternalDriverDetail(id: string | null) {
  return useQuery({
    queryKey: queryKeys.drivers.internalDetail(id ?? ''),
    queryFn: () => fetchInternalDriverDetail(id as string),
    enabled: Boolean(id),
  });
}

/** Bảng chuyến của trang chi tiết tài xế nội bộ (tìm, lọc trạng thái, phân trang server-side). */
export function useInternalDriverTrips(id: string | null, filters: DriverTripFilters) {
  const params = { ...tripFiltersToParams(filters), status: filters.status ?? null };
  return useQuery({
    queryKey: queryKeys.drivers.internalTrips(id ?? '', params),
    queryFn: () => fetchInternalDriverTrips(id as string, filters),
    enabled: Boolean(id),
    placeholderData: (prev) => prev,
  });
}

function useInternalDriverMutation<TVars, TResult>(fn: (vars: TVars) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.drivers.all }),
  });
}

export const useCreateInternalDriver = () =>
  useInternalDriverMutation((body: CreateInternalDriverInput) => createInternalDriver(body));

export const useUpdateInternalDriver = () =>
  useInternalDriverMutation(({ id, body }: { id: string; body: UpdateInternalDriverInput }) =>
    updateInternalDriver(id, body),
  );

export const useArchiveInternalDriver = () =>
  useInternalDriverMutation((id: string) => archiveInternalDriver(id));

export const useRestoreInternalDriver = () =>
  useInternalDriverMutation((id: string) => restoreInternalDriver(id));
