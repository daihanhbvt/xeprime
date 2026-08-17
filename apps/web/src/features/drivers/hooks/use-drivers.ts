'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import {
  createDriver,
  deleteDriver,
  fetchAssignableDrivers,
  fetchDrivers,
  filtersToParams,
  updateDriver,
} from '../api';
import type { CreateDriverInput, DriverFilters, UpdateDriverInput } from '../types';

/** Danh sách tài xế (phân trang/tìm kiếm server-side). */
export function useDrivers(filters: DriverFilters) {
  return useQuery({
    queryKey: queryKeys.drivers.list(filtersToParams(filters)),
    queryFn: () => fetchDrivers(filters),
    placeholderData: (prev) => prev,
  });
}

/**
 * Bộ chọn "gán tài xế vào đơn" (17/08): server trả CẢ người không khả dụng trong khung giờ
 * của đơn kèm lý do (bận / GPLX hết hạn) — UI disable với giải thích, backend vẫn kiểm lại
 * trong transaction (không tin FE).
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

export function useCreateDriver() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateDriverInput) => createDriver(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.drivers.all }),
  });
}

export function useUpdateDriver() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateDriverInput }) => updateDriver(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.drivers.all }),
  });
}

export function useDeleteDriver() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteDriver(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.drivers.all }),
  });
}
