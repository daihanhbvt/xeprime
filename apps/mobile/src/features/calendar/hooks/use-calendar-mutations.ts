import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@xeprime/api-client';
import {
  calendarApi,
  type CreateVehicleBlockInput,
  type SaveDailyPricesInput,
  type UpdateVehicleBlockInput,
} from '../api';

/**
 * Khoá/gỡ khoá xe đổi occupancy → mọi bề mặt lịch (events, hàng còn trống) phải làm mới.
 * Nhánh `vehicles` làm mới luôn vì thẻ xe ở danh sách có chỉ số lịch.
 *
 * Invalidate cả NHÁNH thay vì gọi tên từng key: sót một key nghĩa là người dùng nhìn một cái lịch
 * nói dối ngay sau khi họ vừa bấm nút. Phạm vi dừng ở đúng hai nhánh này — `bookings`,
 * `customers`, `finance` không đổi vì một lệnh khoá xe.
 */
function invalidateAfterBlockChange(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
}

export function useCreateVehicleBlock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateVehicleBlockInput) => calendarApi.createBlock(body),
    onSuccess: () => invalidateAfterBlockChange(queryClient),
  });
}

export function useUpdateVehicleBlock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateVehicleBlockInput }) =>
      calendarApi.updateBlock(id, body),
    onSuccess: (updated) => {
      // Bản vừa lưu mang `rowVersion` MỚI — ghi thẳng vào cache để lần sửa kế tiếp không 409.
      queryClient.setQueryData(queryKeys.calendar.block(updated.id), updated);
      invalidateAfterBlockChange(queryClient);
    },
  });
}

export function useDeleteVehicleBlock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => calendarApi.deleteBlock(id),
    onSuccess: () => invalidateAfterBlockChange(queryClient),
  });
}

/**
 * Giá riêng theo ngày KHÔNG đụng occupancy — chỉ làm mới nhánh lịch (dấu giá) và giá của xe.
 * Báo giá public do server tính nên không có cache client nào khác phải đụng.
 */
function invalidateAfterPriceChange(queryClient: QueryClient, vehicleId: string): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.pricing(vehicleId) });
}

export function useSaveDailyPrices() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ vehicleId, body }: { vehicleId: string; body: SaveDailyPricesInput }) =>
      calendarApi.saveVehicleDailyPrices(vehicleId, body),
    onSuccess: (_data, { vehicleId }) => invalidateAfterPriceChange(queryClient, vehicleId),
  });
}

export function useDeleteDailyPrices() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ vehicleId, from, to }: { vehicleId: string; from: string; to: string }) =>
      calendarApi.deleteVehicleDailyPrices(vehicleId, from, to),
    onSuccess: (_data, { vehicleId }) => invalidateAfterPriceChange(queryClient, vehicleId),
  });
}
