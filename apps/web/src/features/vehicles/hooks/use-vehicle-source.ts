'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { fetchVehicleSource, saveVehicleSource } from '../api';
import type { SaveVehicleSourceInput } from '../types';

/**
 * Hồ sơ nguồn xe & tài chính. `enabled` cho phép nơi gọi tắt query khi thiếu `finance.view` —
 * gọi để nhận 403 rồi hiện lỗi là trải nghiệm tệ hơn màn "không có quyền" chủ động.
 */
export function useVehicleSource(vehicleId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.vehicles.source(vehicleId ?? ''),
    queryFn: () => fetchVehicleSource(vehicleId!),
    enabled: Boolean(vehicleId) && enabled,
  });
}

/**
 * Lưu hồ sơ nguồn. Invalidate cả nhánh `vehicles`: đổi hình thức nguồn làm lệch badge ở
 * danh sách/thẻ xe và phần tóm tắt ở Hồ sơ 360.
 */
export function useSaveVehicleSource(vehicleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SaveVehicleSourceInput) => saveVehicleSource(vehicleId, body),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.vehicles.source(vehicleId), data);
      void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
    },
  });
}
