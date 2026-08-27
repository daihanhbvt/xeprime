'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import {
  createVehicleBlock,
  deleteVehicleBlock,
  deleteVehicleDailyPrices,
  saveVehicleDailyPrices,
  updateVehicleBlock,
} from '../api';
import type {
  CreateVehicleBlockInput,
  SaveDailyPricesInput,
  UpdateVehicleBlockInput,
} from '../types/calendar.types';

/**
 * Khoá/gỡ khoá xe đổi occupancy → mọi bề mặt lịch (events, hàng còn trống) phải làm mới.
 * Nhánh `vehicles` làm mới luôn vì thẻ xe ở danh sách có chỉ số lịch.
 */
function invalidateAfterBlockChange(queryClient: ReturnType<typeof useQueryClient>): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
}

export function useCreateVehicleBlock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateVehicleBlockInput) => createVehicleBlock(body),
    onSuccess: () => invalidateAfterBlockChange(queryClient),
  });
}

export function useUpdateVehicleBlock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateVehicleBlockInput }) =>
      updateVehicleBlock(id, body),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.calendar.block(updated.id), updated);
      invalidateAfterBlockChange(queryClient);
    },
  });
}

export function useDeleteVehicleBlock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteVehicleBlock(id),
    onSuccess: () => invalidateAfterBlockChange(queryClient),
  });
}

/**
 * Giá riêng theo ngày KHÔNG đụng occupancy — chỉ làm mới nhánh lịch (dấu giá) và giá của xe.
 * Báo giá public do server tính nên không có cache FE nào khác phải đụng.
 */
function invalidateAfterPriceChange(
  queryClient: ReturnType<typeof useQueryClient>,
  vehicleId: string,
): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.pricing(vehicleId) });
}

export function useSaveDailyPrices() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ vehicleId, body }: { vehicleId: string; body: SaveDailyPricesInput }) =>
      saveVehicleDailyPrices(vehicleId, body),
    onSuccess: (_data, { vehicleId }) => invalidateAfterPriceChange(queryClient, vehicleId),
  });
}

export function useDeleteDailyPrices() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ vehicleId, from, to }: { vehicleId: string; from: string; to: string }) =>
      deleteVehicleDailyPrices(vehicleId, from, to),
    onSuccess: (_data, { vehicleId }) => invalidateAfterPriceChange(queryClient, vehicleId),
  });
}
