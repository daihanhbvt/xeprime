'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import {
  endDriver,
  fetchAssignableDrivers,
  fetchDrivers,
  filtersToParams,
  inviteDriver,
  resumeDriver,
  suspendDriver,
  updateDriver,
} from '../api';
import type { DriverFilters, InviteDriverInput, UpdateDriverInput } from '../types';

/** Danh sách liên kết tài xế (phân trang/tìm kiếm server-side). */
export function useDrivers(filters: DriverFilters) {
  return useQuery({
    queryKey: queryKeys.drivers.list(filtersToParams(filters)),
    queryFn: () => fetchDrivers(filters),
    placeholderData: (prev) => prev,
  });
}

/**
 * Bộ chọn "gán tài xế vào đơn": server trả CẢ người bận trong khung giờ (disable, không nói bận
 * ở đâu) kèm trạng thái bằng lái; backend vẫn kiểm lại trong transaction.
 */
export function useAssignableDrivers(
  window: { pickupAt: string; returnAt: string; excludeBookingId?: string },
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.drivers.assignable(window),
    queryFn: () => fetchAssignableDrivers(window),
    enabled,
    staleTime: 30_000,
  });
}

function useDriverMutation<TVars>(fn: (vars: TVars) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.drivers.all }),
  });
}

export const useInviteDriver = () =>
  useDriverMutation((body: InviteDriverInput) => inviteDriver(body));

export const useUpdateDriver = () =>
  useDriverMutation(({ id, body }: { id: string; body: UpdateDriverInput }) =>
    updateDriver(id, body),
  );

export const useSuspendDriver = () => useDriverMutation((id: string) => suspendDriver(id));
export const useResumeDriver = () => useDriverMutation((id: string) => resumeDriver(id));
export const useEndDriver = () => useDriverMutation((id: string) => endDriver(id));
