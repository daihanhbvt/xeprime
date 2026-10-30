'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import {
  endDriver,
  fetchAssignableDrivers,
  fetchDriverAssignments,
  fetchDriverOverview,
  fetchDriverWageSettings,
  fetchDrivers,
  filtersToParams,
  inviteDriver,
  resumeDriver,
  suspendDriver,
  updateDriver,
  updateDriverWageSettings,
} from '../api';
import type {
  DriverFilters,
  InviteDriverInput,
  UpdateDriverInput,
  UpdateDriverWageSettingsInput,
} from '../types';

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

/** Tiền công/ngày mặc định của gian hàng + giới hạn (ADR 0075). */
export function useDriverWageSettings(enabled = true) {
  return useQuery({
    queryKey: queryKeys.drivers.wageSettings,
    queryFn: fetchDriverWageSettings,
    enabled,
    staleTime: 60_000,
  });
}

/**
 * Đặt / xoá mức mặc định. Làm mới cả nhánh `bookings`: gợi ý tiền công của hộp gán (khoá dưới
 * chi tiết đơn) đọc mức này.
 */
export function useUpdateDriverWageSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateDriverWageSettingsInput) => updateDriverWageSettings(body),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.drivers.wageSettings, data);
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
    },
  });
}

/** Ngăn chi tiết một tài xế trong tháng — tải khi ngăn mở; đổi tháng giữ số cũ tới khi có số mới. */
export function useDriverOverview(id: string | null, month: string | undefined) {
  return useQuery({
    queryKey: queryKeys.drivers.overview(id ?? '', { month: month ?? null }),
    queryFn: () => fetchDriverOverview(id as string, month),
    enabled: Boolean(id),
    placeholderData: (prev) => (prev && prev.driver.id === id ? prev : undefined),
  });
}

/** Tab "Chuyến & tiền công" trong ngăn chi tiết tài xế (phân trang server-side). */
export function useDriverAssignments(id: string | null, month: string | undefined, page: number) {
  const params = { month: month ?? null, page };
  return useQuery({
    queryKey: queryKeys.drivers.assignments(id ?? '', params),
    queryFn: () => fetchDriverAssignments(id as string, { month, page }),
    enabled: Boolean(id),
    placeholderData: (prev) => prev,
  });
}
