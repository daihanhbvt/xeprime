'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import {
  createVehicle,
  deleteVehicle,
  setVehicleMarketplaceVisibility,
  submitVehiclePublic,
  updateVehicle,
} from '../api';
import type { CreateVehicleInput, UpdateVehicleInput } from '../types';

/** Sau mỗi mutation, invalidate nhánh `vehicles` để mọi danh sách/chi tiết đang mở tự tải lại. */
export function useCreateVehicle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateVehicleInput) => createVehicle(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all }),
  });
}

export function useUpdateVehicle(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateVehicleInput) => updateVehicle(id, body),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.vehicles.detail(id), updated);
      void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
    },
  });
}

export function useDeleteVehicle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteVehicle(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all }),
  });
}

/** Gửi xe đi duyệt công khai; cập nhật chi tiết + làm mới danh sách (badge trạng thái đổi). */
export function useSubmitVehiclePublic(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => submitVehiclePublic(id),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.vehicles.detail(id), updated);
      void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
    },
  });
}

/**
 * Bật/tắt hiển thị xe trên chợ (ADR 0048).
 *
 * Làm mới thêm nhánh `marketplace` — thứ mà các mutation xe khác không cần: chi tiết xe ngoài
 * chợ, kết quả tìm kiếm, trang gian hàng và khối gợi ý đều vừa đổi nội dung, và một cache cũ ở
 * đó là chiếc xe vừa bị cất đi vẫn bày ra cho tới khi người dùng tự tải lại trang. Nhánh
 * `vehicles` phủ chi tiết + danh sách + `stats`/`alerts` của khu quản lý.
 */
export function useSetVehicleMarketplaceVisibility(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => setVehicleMarketplaceVisibility(id, enabled),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.vehicles.detail(id), updated);
      void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.marketplace.all });
    },
  });
}
