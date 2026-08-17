'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DRIVER_STATUS } from '@xeprime/types';
import { queryKeys } from '@/services/query-keys';
import {
  createDriver,
  deleteDriver,
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

/** Bộ chọn "gán tài xế vào đơn" — chỉ tài xế ĐANG hoạt động, đủ rộng cho một shop thật. */
export function useAssignableDrivers(enabled = true) {
  const filters: DriverFilters = { status: DRIVER_STATUS.ACTIVE, limit: 100 };
  return useQuery({
    queryKey: queryKeys.drivers.list(filtersToParams(filters)),
    queryFn: () => fetchDrivers(filters),
    enabled,
    staleTime: 60_000,
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
