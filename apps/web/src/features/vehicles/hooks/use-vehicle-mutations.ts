'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { createVehicle, deleteVehicle, submitVehiclePublic, updateVehicle } from '../api';
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
