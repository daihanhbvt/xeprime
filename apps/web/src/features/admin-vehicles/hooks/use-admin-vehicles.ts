'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchAdminVehicle,
  fetchAdminVehicles,
  filtersToParams,
  hideVehicle,
  unhideVehicle,
} from '../api';
import type { AdminVehicleFilters } from '../types';

export function useAdminVehicles(filters: AdminVehicleFilters) {
  return useQuery({
    queryKey: ['admin-vehicles', filtersToParams(filters)],
    queryFn: () => fetchAdminVehicles(filters),
    placeholderData: keepPreviousData,
  });
}

export function useAdminVehicle(id: string | null) {
  return useQuery({
    queryKey: ['admin-vehicle', id],
    queryFn: () => fetchAdminVehicle(id as string),
    enabled: Boolean(id),
  });
}

/**
 * Ẩn / bỏ ẩn xe. Sau khi xong ghi thẳng chi tiết vừa nhận vào cache rồi làm mới danh sách —
 * trạng thái listing đổi theo nên hàng trong bảng phải vẽ lại.
 */
export function useVehicleModeration(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    // Không destructure tham số: TS chỉ thu hẹp được union khi còn giữ biến gốc để so `kind`.
    mutationFn: (input: { kind: 'hide'; reason: string } | { kind: 'unhide' }) =>
      input.kind === 'hide' ? hideVehicle(id, input.reason) : unhideVehicle(id),
    onSuccess: (detail) => {
      queryClient.setQueryData(['admin-vehicle', id], detail);
      void queryClient.invalidateQueries({ queryKey: ['admin-vehicles'] });
    },
  });
}
