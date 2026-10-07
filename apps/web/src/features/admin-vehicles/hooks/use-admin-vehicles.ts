'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
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
    queryKey: queryKeys.platformVehicles.list(filtersToParams(filters)),
    queryFn: () => fetchAdminVehicles(filters),
    placeholderData: keepPreviousData,
  });
}

export function useAdminVehicle(id: string | null) {
  return useQuery({
    queryKey: queryKeys.platformVehicles.detail(id ?? ''),
    queryFn: () => fetchAdminVehicle(id as string),
    enabled: Boolean(id),
  });
}

/**
 * Ẩn / gỡ ẩn xe. ID xe đi trong BIẾN của lượt gọi chứ không qua tham số hook: người kiểm duyệt
 * có thể bấm "Xe sau" khi lượt ẩn của xe trước còn đang bay, và một callback đọc id từ lần render
 * gần nhất sẽ ghi chi tiết của xe A vào cache của xe B.
 *
 * Xong: ghi thẳng chi tiết vừa nhận vào cache rồi làm mới danh sách (trạng thái trên chợ và số
 * đếm các góc nhìn đổi theo nên bảng phải vẽ lại).
 */
export function useVehicleModeration() {
  const queryClient = useQueryClient();
  return useMutation({
    // Không destructure tham số: TS chỉ thu hẹp được union khi còn giữ biến gốc để so `kind`.
    mutationFn: (input: { id: string; kind: 'hide'; reason: string } | { id: string; kind: 'unhide' }) =>
      input.kind === 'hide' ? hideVehicle(input.id, input.reason) : unhideVehicle(input.id),
    onSuccess: (detail, { id }) => {
      queryClient.setQueryData(queryKeys.platformVehicles.detail(id), detail);
      void queryClient.invalidateQueries({
        queryKey: queryKeys.platformVehicles.all,
        // Chi tiết vừa được ghi bằng bản mới nhất — không cần nạp lại chính nó.
        predicate: (query) => query.queryKey[1] !== 'detail' || query.queryKey[2] !== id,
      });
    },
  });
}
