'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import {
  archiveInternalDriver,
  createInternalDriver,
  fetchAssignableInternalDrivers,
  fetchInternalDrivers,
  internalFiltersToParams,
  restoreInternalDriver,
  updateInternalDriver,
} from '../api';
import type {
  CreateInternalDriverInput,
  InternalDriverFilters,
  UpdateInternalDriverInput,
} from '../types';

/** Danh bạ tài xế nội bộ (ADR 0108) — phân trang + tìm ở server. */
export function useInternalDrivers(filters: InternalDriverFilters, enabled = true) {
  return useQuery({
    queryKey: queryKeys.drivers.internal(internalFiltersToParams(filters)),
    queryFn: () => fetchInternalDrivers(filters),
    placeholderData: (prev) => prev,
    enabled,
  });
}

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
